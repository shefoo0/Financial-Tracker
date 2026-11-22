// Extra R8/ProGuard rules for release builds. pdfbox-android (used by
// expo-pdf-text-extract to read PDF statements) refers to an optional
// JPEG 2000 decoder that isn't shipped; without this rule the release build
// fails with "Missing class com.gemalto.jp2.JP2Decoder". JPEG 2000 images in
// PDFs are rare in bank statements, and text extraction doesn't need them.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const RULES = `
# --- with-proguard-rules (app plugin) ---
-dontwarn com.gemalto.jp2.**
`;

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes('with-proguard-rules')) fs.writeFileSync(file, current + RULES);
      return cfg;
    },
  ]);
};
