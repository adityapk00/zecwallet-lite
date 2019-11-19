#[macro_use]
extern crate lazy_static;

use libc::{c_char};

use std::ffi::{CStr, CString};
use std::sync::{Mutex, Arc};
use std::cell::RefCell;

use zecwalletlitelib::{commands, lightclient::{LightClient, LightClientConfig}};

// We'll use a MUTEX to store a global lightclient instance, 
// so we don't have to keep creating it. We need to store it here, in rust
// because we can't return such a complex structure back to C++
lazy_static! {
    static ref LIGHTCLIENT: Mutex<RefCell<Option<Arc<LightClient>>>> = Mutex::new(RefCell::new(None));
}

// Check if there is an existing wallet
#[no_mangle]
pub extern fn litelib_wallet_exists(chain_name: *const c_char) -> bool {
    let chain_name_str = unsafe {
        assert!(!chain_name.is_null());

        CStr::from_ptr(chain_name).to_string_lossy().into_owned()
    };

    let config = LightClientConfig::create_unconnected(chain_name_str, None);

    println!("Wallet exists: {}", config.wallet_exists());
    config.wallet_exists()
}

/// Create a new wallet and return the seed for the newly created wallet.
#[no_mangle]
pub extern fn litelib_initialize_new(dangerous: bool, server: *const c_char) -> *mut c_char {
    let server_str = unsafe {
        assert!(!server.is_null());

        CStr::from_ptr(server).to_string_lossy().into_owned()
    };

    let server = LightClientConfig::get_server_or_default(Some(server_str));
    let (config, latest_block_height) = match LightClientConfig::create(server, dangerous) {
        Ok((c, h)) => (c, h),
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    let lightclient = match LightClient::new(&config, latest_block_height) {
        Ok(l) => l,
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    // Initialize logging
    let _ = lightclient.init_logging();

    let seed = match lightclient.do_seed_phrase() {
        Ok(s) => s.dump(),
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));

    // Return the wallet's seed
    let s_str = CString::new(seed).unwrap();
    return s_str.into_raw();
}

/// Restore a wallet from the seed phrase
#[no_mangle]
pub extern fn litelib_initialize_new_from_phrase(dangerous: bool, server: *const c_char, 
            seed: *const c_char, birthday: u64) -> *mut c_char {
    let server_str = unsafe {
        assert!(!server.is_null());

        CStr::from_ptr(server).to_string_lossy().into_owned()
    };

    let seed_str = unsafe {
        assert!(!seed.is_null());

        CStr::from_ptr(seed).to_string_lossy().into_owned()
    };

    let server = LightClientConfig::get_server_or_default(Some(server_str));
    let (config, _latest_block_height) = match LightClientConfig::create(server, dangerous) {
        Ok((c, h)) => (c, h),
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    let lightclient = match LightClient::new_from_phrase(seed_str, &config, birthday) {
        Ok(l) => l,
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    // Initialize logging
    let _ = lightclient.init_logging();

    LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));
 
    let c_str = CString::new("OK").unwrap();
    return c_str.into_raw();
}

// Initialize a new lightclient and store its value
#[no_mangle]
pub extern fn litelib_initialize_existing(dangerous: bool, server: *const c_char) -> *mut c_char {
    let server_str = unsafe {
        assert!(!server.is_null());

        CStr::from_ptr(server).to_string_lossy().into_owned()
    };

    let server = LightClientConfig::get_server_or_default(Some(server_str));
    let (config, _latest_block_height) = match LightClientConfig::create(server, dangerous) {
        Ok((c, h)) => (c, h),
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    let lightclient = match LightClient::read_from_disk(&config) {
        Ok(l) => l,
        Err(e) => {
            let e_str = CString::new(format!("Error: {}", e)).unwrap();
            return e_str.into_raw();
        }
    };

    // Initialize logging
    let _ = lightclient.init_logging();

    LIGHTCLIENT.lock().unwrap().replace(Some(Arc::new(lightclient)));

    let c_str = CString::new("OK").unwrap();
    return c_str.into_raw();
}

#[no_mangle]
pub extern fn litelib_execute(cmd: *const c_char, args: *const c_char) -> *mut c_char {
    let cmd_str = unsafe {
        assert!(!cmd.is_null());

        CStr::from_ptr(cmd).to_string_lossy().into_owned()
    };

    let arg_str = unsafe {
        assert!(!args.is_null());

        CStr::from_ptr(args).to_string_lossy().into_owned()
    };

    let resp: String;
    {
        let lightclient: Arc<LightClient>;
        {
            let lc = LIGHTCLIENT.lock().unwrap();

            if lc.borrow().is_none() {
                let e_str = CString::new("Error: Light Client is not initialized").unwrap();
                return e_str.into_raw();
            }

            lightclient = lc.borrow().as_ref().unwrap().clone();
        };

        let args = if arg_str.is_empty() { vec![] } else { vec![arg_str.as_ref()] };

        resp = commands::do_user_command(&cmd_str, &args, lightclient.as_ref()).clone();
    };

    let c_str = CString::new(resp.as_bytes()).unwrap();
    return c_str.into_raw();
}

/**
 * Callers that receive string return values from other functions should call this to return the string 
 * back to rust, so it can be freed. Failure to call this function will result in a memory leak
 */ 
#[no_mangle]
pub extern fn litelib_rust_free_string(s: *mut c_char) {
    unsafe {
        if s.is_null() { return }
        CString::from_raw(s)
    };
}