#ifndef _ZEC_PAPER_RUST_H
#define _ZEC_PAPER_RUST_H

#ifdef __cplusplus
extern "C" {
#endif

extern bool   litelib_wallet_exists       (const char* chain_name);
extern char * litelib_initialize_new      (bool dangerous, const char* server);
extern char * litelib_initialize_new_from_phrase
                                          (bool dangerous, const char* server, const char* seed,
                                           unsigned long long birthday);  
extern char * litelib_initialize_existing (bool dangerous, const char* server);
extern char * litelib_execute             (const char* s, const char* args);
extern void   litelib_rust_free_string    (char* s);

#ifdef __cplusplus
}
#endif

// This is a function implemented in connection.cpp that will process a string response from 
// the litelib and turn into into a QString in a memory-safe way.
QString litelib_process_response(char* resp);

#endif