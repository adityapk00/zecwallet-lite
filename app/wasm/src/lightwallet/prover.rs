//! Abstractions over the proving system and parameters for ease of use.

use bellman::groth16::{prepare_verifying_key, Parameters, PreparedVerifyingKey};
use pairing::bls12_381::{Bls12, Fr};
use zcash_primitives::{
    jubjub::{edwards, fs::Fs, Unknown},
    primitives::{Diversifier, PaymentAddress, ProofGenerationKey},
    redjubjub::{PublicKey, Signature},
    transaction::components::Amount
};
use zcash_primitives::{
    merkle_tree::CommitmentTreeWitness, prover::TxProver, sapling::Node,
    transaction::components::GROTH_PROOF_SIZE, JUBJUB,
};
use zcash_proofs::sapling::SaplingProvingContext;

/// An implementation of [`TxProver`] using Sapling Spend and Output parameters provided
/// in-memory.
pub struct InMemTxProver {
    spend_params: Parameters<Bls12>,
    spend_vk: PreparedVerifyingKey<Bls12>,
    output_params: Parameters<Bls12>,
}

impl InMemTxProver {
    pub fn new(spend_params: &[u8], output_params: &[u8]) -> Self {
        // Deserialize params
        let spend_params = Parameters::<Bls12>::read(spend_params, false)
            .expect("couldn't deserialize Sapling spend parameters file");
        let output_params = Parameters::<Bls12>::read(output_params, false)
            .expect("couldn't deserialize Sapling spend parameters file");

        // Prepare verifying keys
        let spend_vk = prepare_verifying_key(&spend_params.vk);

        InMemTxProver {
            spend_params,
            spend_vk,
            output_params,
        }
    }
}

impl TxProver for InMemTxProver {
    type SaplingProvingContext = SaplingProvingContext;

    fn new_sapling_proving_context(&self) -> Self::SaplingProvingContext {
        SaplingProvingContext::new()
    }

    fn spend_proof(
        &self,
        ctx: &mut Self::SaplingProvingContext,
        proof_generation_key: ProofGenerationKey<Bls12>,
        diversifier: Diversifier,
        rcm: Fs,
        ar: Fs,
        value: u64,
        anchor: Fr,
        witness: CommitmentTreeWitness<Node>,
    ) -> Result<
        (
            [u8; GROTH_PROOF_SIZE],
            edwards::Point<Bls12, Unknown>,
            PublicKey<Bls12>,
        ),
        (),
    > {
        let (proof, cv, rk) = ctx.spend_proof(
            proof_generation_key,
            diversifier,
            rcm,
            ar,
            value,
            anchor,
            witness,
            &self.spend_params,
            &self.spend_vk,
            &JUBJUB,
        )?;

        let mut zkproof = [0u8; GROTH_PROOF_SIZE];
        proof
            .write(&mut zkproof[..])
            .expect("should be able to serialize a proof");

        Ok((zkproof, cv, rk))
    }

    fn output_proof(
        &self,
        ctx: &mut Self::SaplingProvingContext,
        esk: Fs,
        payment_address: PaymentAddress<Bls12>,
        rcm: Fs,
        value: u64,
    ) -> ([u8; GROTH_PROOF_SIZE], edwards::Point<Bls12, Unknown>) {
        let (proof, cv) = ctx.output_proof(
            esk,
            payment_address,
            rcm,
            value,
            &self.output_params,
            &JUBJUB,
        );

        let mut zkproof = [0u8; GROTH_PROOF_SIZE];
        proof
            .write(&mut zkproof[..])
            .expect("should be able to serialize a proof");

        (zkproof, cv)
    }

    fn binding_sig(
        &self,
        ctx: &mut Self::SaplingProvingContext,
        value_balance: Amount,
        sighash: &[u8; 32],
    ) -> Result<Signature, ()> {
        ctx.binding_sig(value_balance, sighash, &JUBJUB)
    }
}
