# Vendored browser dependencies

`supabase-2.110.8.js` is the UMD browser build from
`@supabase/supabase-js@2.110.8` (MIT), copied without modification from the
installed package. `index.html` pins its SHA-384 Subresource Integrity hash.

When upgrading, update the npm dependency, copy the matching UMD build, rename
the file, recalculate the integrity value, and run the full test suite.
