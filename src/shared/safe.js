export const safe = (s) => String(s || '')
  .replace(/@everyone/g, '@\u200beveryone')
  .replace(/@here/g, '@\u200bhere');
