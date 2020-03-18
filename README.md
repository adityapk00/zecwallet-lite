**Zecwallet Web is Experimental**


Zecwallet Web is the Zecwallet Lite client compiled to run inside a browser. __Please read [privacy section](#privacy) below before using it__.

## Running locally

#### Pre-requisites
You'll need several prerequisites to run Zecwallet Web locally:
1. [Install nodejs v13](https://nodejs.org/en/download/package-manager/)
2. [Rust v1.40 or higher](https://www.rust-lang.org/tools/install)
3. [Wasm Pack](https://rustwasm.github.io/wasm-pack/installer/)

#### Setup
Clone the git repository
```
git clone https://github.com/adityapk00/zecwallet-lite
cd zecwallet-lite
git checkout wasm
```

Build the wasm packge + node files
```
cd app/wasm
wasm-pack build
cd ../..
npm install
npm run build
```

Run!
```
npx serve -s build
```

You can now view the wallet at `http://localhost:5000`

## Run envoy proxy locally
Since web browsers can't make gRPC calls, we need to route the requests through the Envoy proxy. Normally, you'd use the one running at `lightwalletd.zecwallet.co`, but you can use your own as well

First, [Install docker](https://doc.owncloud.com/server/admin_manual/installation/docker/)

Then, 
```
cd envoy
docker build . --tag zecwallet/envoyproxy:latest
docker run -it --rm -p 8080:8080 -p 9901:9901 zecwallet/envoyproxy:latest
```

This will start the envoy proxy on `localhost:8080`. Press `CTRL+C` to stop it

You'll need to edit `app/wasm/wasmbridge.js` and edit the `ENVOY_PROXY` variable to point to `http://localhost:8080`. 

## Run lightwalletd locally
You can also run the light client server, lightwalletd locally. Please see the [lightwalletd page](http://github.com/adityapk00/lightwalletd)

You'll need to edit the envoy proxy config file in `envoy/envoy.yaml` to point to your lightwalletd server, and rebuild the docker image and run it. 

## Privacy
Using a web wallet is generally not a good idea, since your private keys live in the browser and might get stolen. Please only use Zecwallet Web with small amounts of money, and don't use it on machines and browsers you don't trust. 

* Zecwallet Web has *not been audited*, so it likely has bugs and other vulnerabilities
* Your wallet, its private keys and your seed phrase are all stored inside the browser. If your browser is compromised, you will likely lose your private keys and probably your funds. 
* While you get blockchain privacy if you use z-addresses, using Zecwallet Web likely exposes your IP address to malilcious attackers and might be used to link your on-chain transactions
* Currently, WASM is limited by a single thread, so some operations, like sending transactions, might be very slow. 
* Zecwallet Web uses a custom fork of librustzcash that replaces some libraries (most noteably secp256k1) with their pure-rust implementations. This might cause unexpected bugs or security issues.

