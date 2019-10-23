#ifndef _hush_PAPER_RUST_H
#define _hush_PAPER_RUST_H

#ifdef __cplusplus
extern "C" {
#endif

extern bool   litelib_wallet_exists      (const char* chain_name, const char* dir);
extern char * litelib_initialze_existing (bool dangerous, const char* server);
extern char * litelib_execute            (const char* s, const char* args);
extern void   litelib_rust_free_string   (char* s);

#ifdef __cplusplus
}
#endif

#endif
