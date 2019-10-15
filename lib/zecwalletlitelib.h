#ifndef _ZEC_PAPER_RUST_H
#define _ZEC_PAPER_RUST_H

#ifdef __cplusplus
extern "C"{
#endif

extern char * litelib_initialze         (bool dangerous, const char* server);
extern char * litelib_execute           (char* s);
extern void   litelib_rust_free_string  (char* s);

#ifdef __cplusplus
}
#endif

#endif