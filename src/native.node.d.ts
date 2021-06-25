export function litelib_say_hello(s: string): string;
export function litelib_wallet_exists(chain_name: string): boolean;
export function litelib_initialize_new(server_uri: string): string;
export function litelib_initialize_new_from_phrase(
  server_uri: string,
  seed: string,
  birthday: number,
  overwrite: boolean
): string;
export function litelib_initialize_existing(server_uri: string): string;
export function litelib_deinitialize(): string;
export function litelib_execute(cmd: string, args: string): string;
