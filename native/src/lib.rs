#[macro_use]
extern crate lazy_static;

use neon::prelude::Context;
use neon::prelude::FunctionContext;
use neon::prelude::JsBoolean;
use neon::prelude::JsNumber;
use neon::prelude::JsResult;
use neon::prelude::JsString;
use neon::register_module;
use zecwalletlitelib::lightclient::lightclient_config::LightClientConfig;
use zecwalletlitelib::MainNetwork;

use std::cell::RefCell;
use std::sync::{Arc, Mutex};
use std::thread;

use zecwalletlitelib::{commands, lightclient::LightClient};

// We'll use a MUTEX to store a global lightclient instance,
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to JS
lazy_static! {
    static ref LIGHTCLIENT: Mutex<RefCell<Option<Arc<LightClient<MainNetwork>>>>> =
        Mutex::new(RefCell::new(None));
}

register_module!(mut m, {
    //m.export_function("litelib_say_hello", litelib_say_hello)?;
    m.export_function("litelib_wallet_exists", litelib_wallet_exists)?;
    m.export_function("litelib_initialize_new", litelib_initialize_new)?;
    m.export_function("litelib_initialize_existing", litelib_initialize_existing)?;
    m.export_function(
        "litelib_initialize_new_from_phrase",
        litelib_initialize_new_from_phrase,
    )?;
    m.export_function("litelib_deinitialize", litelib_deinitialize)?;
    m.export_function("litelib_execute", litelib_execute)?;
    Ok(())
});

// Check if there is an existing wallet
fn litelib_wallet_exists(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let _chain_name = cx.argument::<JsString>(0)?.value(&mut cx);
    let config = LightClientConfig::create_unconnected(MainNetwork, None);

    Ok(cx.boolean(config.wallet_exists()))
}

/// Create a new wallet and return the seed for the newly created wallet.
fn litelib_initialize_new(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let resp = || {
        let server = LightClientConfig::<MainNetwork>::get_server_or_default(Some(server_uri));
        let (config, latest_block_height) =
            match LightClientConfig::create(MainNetwork, server, None) {
                Ok((c, h)) => (c, h),
                Err(e) => {
                    return format!("Error: {}", e);
                }
            };

        let lightclient = match LightClient::new(&config, latest_block_height.saturating_sub(100)) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = lightclient.init_logging();

        let seed = match lightclient.do_seed_phrase_sync() {
            Ok(s) => s.dump(),
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        LIGHTCLIENT.lock().unwrap().replace(Some(lc));

        // Return the wallet's seed
        seed
    };

    Ok(cx.string(resp()))
}

/// Restore a wallet from the seed phrase
fn litelib_initialize_new_from_phrase(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);
    let seed = cx.argument::<JsString>(1)?.value(&mut cx);
    let birthday = cx.argument::<JsNumber>(2)?.value(&mut cx);
    let overwrite = cx.argument::<JsBoolean>(3)?.value(&mut cx);

    let resp = || {
        let server = LightClientConfig::<MainNetwork>::get_server_or_default(Some(server_uri));
        let (config, _latest_block_height) =
            match LightClientConfig::create(MainNetwork, server, None) {
                Ok((c, h)) => (c, h),
                Err(e) => {
                    return format!("Error: {}", e);
                }
            };

        let lightclient =
            match LightClient::new_from_phrase(seed, &config, birthday as u64, overwrite) {
                Ok(l) => l,
                Err(e) => {
                    return format!("Error: {}", e);
                }
            };

        // Initialize logging
        let _ = lightclient.init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        LIGHTCLIENT.lock().unwrap().replace(Some(lc));

        format!("OK")
    };

    Ok(cx.string(resp()))
}

// Initialize a new lightclient and store its value
fn litelib_initialize_existing(mut cx: FunctionContext) -> JsResult<JsString> {
    let server_uri = cx.argument::<JsString>(0)?.value(&mut cx);

    let resp = || {
        let server = LightClientConfig::<MainNetwork>::get_server_or_default(Some(server_uri));
        let (config, _latest_block_height) =
            match LightClientConfig::create(MainNetwork, server, None) {
                Ok((c, h)) => (c, h),
                Err(e) => {
                    return format!("Error: {}", e);
                }
            };

        let lightclient = match LightClient::read_from_disk(&config) {
            Ok(l) => l,
            Err(e) => {
                return format!("Error: {}", e);
            }
        };

        // Initialize logging
        let _ = lightclient.init_logging();

        let lc = Arc::new(lightclient);
        LightClient::start_mempool_monitor(lc.clone());

        LIGHTCLIENT.lock().unwrap().replace(Some(lc));

        format!("OK")
    };

    Ok(cx.string(resp()))
}

fn litelib_deinitialize(mut cx: FunctionContext) -> JsResult<JsString> {
    LIGHTCLIENT.lock().unwrap().replace(None);

    Ok(cx.string(format!("OK")))
}

fn litelib_execute(mut cx: FunctionContext) -> JsResult<JsString> {
    let cmd = cx.argument::<JsString>(0)?.value(&mut cx);
    let args_list = cx.argument::<JsString>(1)?.value(&mut cx);

    let resp = || {
        let lightclient: Arc<LightClient<MainNetwork>>;
        {
            let lc = LIGHTCLIENT.lock().unwrap();

            if lc.borrow().is_none() {
                return format!("Error: Light Client is not initialized");
            }

            lightclient = lc.borrow().as_ref().unwrap().clone();
        };

        if cmd == "sync" || cmd == "rescan" || cmd == "import" || cmd == "send" {
            thread::spawn(move || {
                let args = if args_list.is_empty() {
                    vec![]
                } else {
                    vec![&args_list[..]]
                };
                commands::do_user_command(&cmd, &args, lightclient.as_ref());
            });

            format!("OK")
        } else {
            let args = if args_list.is_empty() {
                vec![]
            } else {
                vec![&args_list[..]]
            };
            commands::do_user_command(&cmd, &args, lightclient.as_ref()).clone()
        }
    };

    Ok(cx.string(resp()))
}
