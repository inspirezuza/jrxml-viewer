# Optional JasperReports Runtime

This module is an opt-in local helper for compiling and filling JRXML files. It is intentionally separate from the static VS Code viewer so the extension remains lightweight and usable without Java.

Build it with Java 17 and Maven:

```bash
mvn package
```

Configure VS Code with:

```json
{
  "jrxmlViewer.runtime.command": "java",
  "jrxmlViewer.runtime.args": [
    "-jar", "C:/path/to/jrxml-viewer-runtime.jar",
    "--input", "{input}", "--output", "{output}", "--format", "{format}"
  ]
}
```

The helper supports PDF, HTML, XLSX and CSV output. Use `--data` with a JSON array or CSV file and `--param name=value` for parameters.

JasperReports and its transitive dependencies retain their own licenses. Review `mvn dependency:tree` and the upstream notices before redistributing a built runtime jar.
