# Benchmark Image Verification

The `findBenchmarkCode` helper inspects an uploaded image filename and maps it to a transaction type code. The lookup works in two steps:

1. Any underscore or dash separated tokens are checked directly against the `code_transaction.UITransType` column.
2. When that fails, rows where `image_benchmark` is set to `1` are scanned. If the filename contains a row's `UITrtype` value, its `UITransType` is returned.

The utility allows the front end to suggest a transaction code based on existing benchmark images without calling the OpenAI API.
