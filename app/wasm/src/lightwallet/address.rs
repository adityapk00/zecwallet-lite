//! Structs for handling supported address types.

use pairing::bls12_381::Bls12;
use zcash_primitives::primitives::PaymentAddress;
use zcash_client_backend::encoding::{decode_payment_address, decode_transparent_address};
use zcash_primitives::legacy::TransparentAddress;

/// An address that funds can be sent to.
pub enum RecipientAddress {
    Shielded(PaymentAddress<Bls12>),
    Transparent(TransparentAddress),
}

impl From<PaymentAddress<Bls12>> for RecipientAddress {
    fn from(addr: PaymentAddress<Bls12>) -> Self {
        RecipientAddress::Shielded(addr)
    }
}

impl From<TransparentAddress> for RecipientAddress {
    fn from(addr: TransparentAddress) -> Self {
        RecipientAddress::Transparent(addr)
    }
}

impl RecipientAddress {
    pub fn from_str(s: &str, hrp_sapling_address: &str, b58_pubkey_address: [u8; 2], b58_script_address: [u8; 2]) -> Option<Self> {
        // Try to match a sapling z address 
        if let Some(pa) = match decode_payment_address(hrp_sapling_address, s) {
                                Ok(ret) => ret,
                                Err(_)  => None
                            } 
        {
            Some(RecipientAddress::Shielded(pa))    // Matched a shielded address
        } else if let Some(addr) = match decode_transparent_address(
                                            &b58_pubkey_address, &b58_script_address, s) {
                                        Ok(ret) => ret,
                                        Err(_)  => None
                                    } 
        {
            Some(RecipientAddress::Transparent(addr))   // Matched a transparent address
        } else {
            None    // Didn't match anything
        }
    }
}
