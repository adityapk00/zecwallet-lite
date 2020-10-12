import { parseZcashURI } from './uris';

test('ZIP321 case 1', () => {
  const targets = parseZcashURI(
    'zcash:ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase'
  );

  expect(targets.length).toBe(1);
  expect(targets[0].address).toBe(
    'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez'
  );
  expect(targets[0].message).toBe('Thank you for your purchase');
  expect(targets[0].label).toBeUndefined();
  expect(targets[0].amount).toBe(1);
  expect(targets[0].memoString).toBe('This is a simple memo.');
});

test('ZIP321 case 2', () => {
  const targets = parseZcashURI(
    'zcash:?address=tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU&amount=123.456&address.1=ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez&amount.1=0.789&memo.1=VGhpcyBpcyBhIHVuaWNvZGUgbWVtbyDinKjwn6aE8J-PhvCfjok'
  );

  expect(targets.length).toBe(2);

  expect(targets[0].address).toBe('tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU');
  expect(targets[0].message).toBeUndefined();
  expect(targets[0].label).toBeUndefined();
  expect(targets[0].amount).toBe(123.456);
  expect(targets[0].memoString).toBeUndefined();
  expect(targets[0].memoBase64).toBeUndefined();

  expect(targets[1].address).toBe(
    'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez'
  );
  expect(targets[1].message).toBeUndefined();
  expect(targets[1].label).toBeUndefined();
  expect(targets[1].amount).toBe(0.789);
  expect(targets[1].memoString).toBe('This is a unicode memo ✨🦄🏆🎉');
});
