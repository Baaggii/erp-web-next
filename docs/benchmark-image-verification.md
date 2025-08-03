# Benchmark Image Verification

The `findBenchmarkCode` helper inspects an uploaded image filename and maps it to a transaction type code. The lookup works in two steps:

1. Any underscore or dash separated tokens that are four digits long are checked against the `code_transaction.UITransType` column.
2. Tokens that are four letters long are checked against the `code_transaction.UITrtype` column and return the corresponding `UITransType`.

The utility allows the front end to suggest a transaction code based on existing benchmark images without calling the OpenAI API.
