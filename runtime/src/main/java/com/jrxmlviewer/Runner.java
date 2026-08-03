package com.jrxmlviewer;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.sf.jasperreports.engine.JRDataSource;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import net.sf.jasperreports.engine.JREmptyDataSource;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.engine.export.HtmlExporter;
import net.sf.jasperreports.export.SimpleCsvExporterConfiguration;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleHtmlExporterOutput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;
import net.sf.jasperreports.export.SimpleXlsxExporterConfiguration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class Runner {
    private Runner() {}

    public static void main(String[] args) throws Exception {
        Map<String, List<String>> options = parse(args);
        Path input = requiredPath(options, "input");
        Path output = requiredPath(options, "output");
        String format = first(options, "format", "pdf").toLowerCase();
        Map<String, Object> parameters = new HashMap<>();
        for (String value : options.getOrDefault("param", List.of())) {
            int separator = value.indexOf('=');
            if (separator > 0) parameters.put(value.substring(0, separator), value.substring(separator + 1));
        }
        JasperReport report = JasperCompileManager.compileReport(input.toString());
        JRDataSource dataSource = dataSource(options);
        JasperPrint print = JasperFillManager.fillReport(report, parameters, dataSource);
        Files.createDirectories(output.toAbsolutePath().getParent());
        switch (format) {
            case "pdf" -> JasperExportManager.exportReportToPdfFile(print, output.toString());
            case "html" -> exportHtml(print, output);
            case "xlsx" -> exportXlsx(print, output);
            case "csv" -> exportCsv(print, output);
            default -> throw new IllegalArgumentException("Unsupported output format: " + format);
        }
        System.out.println(output.toAbsolutePath());
    }

    private static JRDataSource dataSource(Map<String, List<String>> options) throws IOException {
        String data = first(options, "data", "");
        if (data.isBlank()) return new JREmptyDataSource();
        Path path = Path.of(data);
        if (data.toLowerCase().endsWith(".json")) {
            List<Map<String, Object>> decoded = new ObjectMapper().readValue(Files.readString(path), new TypeReference<>() {});
            List<Map<String, ?>> rows = new ArrayList<>();
            rows.addAll(decoded);
            return new JRMapCollectionDataSource(rows);
        }
        List<String> lines = Files.readAllLines(path);
        if (lines.isEmpty()) return new JREmptyDataSource();
        String[] headers = lines.get(0).split(",", -1);
        List<Map<String, ?>> rows = new ArrayList<>();
        for (int line = 1; line < lines.size(); line++) {
            String[] values = lines.get(line).split(",", -1);
            Map<String, Object> row = new HashMap<>();
            for (int index = 0; index < headers.length; index++) row.put(headers[index].trim(), index < values.length ? values[index].trim() : "");
            rows.add(row);
        }
        return new JRMapCollectionDataSource(rows);
    }

    private static void exportHtml(JasperPrint print, Path output) throws JRException, IOException {
        HtmlExporter exporter = new HtmlExporter();
        exporter.setExporterInput(new SimpleExporterInput(print));
        exporter.setExporterOutput(new SimpleHtmlExporterOutput(output.toFile()));
        exporter.exportReport();
    }

    private static void exportXlsx(JasperPrint print, Path output) throws JRException {
        JRXlsxExporter exporter = new JRXlsxExporter();
        exporter.setExporterInput(new SimpleExporterInput(print));
        exporter.setExporterOutput(new SimpleWriterExporterOutput(output.toFile()));
        exporter.setConfiguration(new SimpleXlsxExporterConfiguration());
        exporter.exportReport();
    }

    private static void exportCsv(JasperPrint print, Path output) throws JRException {
        JRCsvExporter exporter = new JRCsvExporter();
        exporter.setExporterInput(new SimpleExporterInput(print));
        exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(output.toFile()));
        exporter.setConfiguration(new SimpleCsvExporterConfiguration());
        exporter.exportReport();
    }

    private static Map<String, List<String>> parse(String[] args) {
        Map<String, List<String>> result = new HashMap<>();
        for (int index = 0; index < args.length; index++) {
            if (!args[index].startsWith("--")) continue;
            String key = args[index].substring(2);
            if (index + 1 < args.length && !args[index + 1].startsWith("--")) result.computeIfAbsent(key, ignored -> new ArrayList<>()).add(args[++index]);
            else result.computeIfAbsent(key, ignored -> new ArrayList<>()).add("true");
        }
        return result;
    }

    private static String first(Map<String, List<String>> options, String key, String fallback) {
        List<String> values = options.get(key);
        return values == null || values.isEmpty() ? fallback : values.get(0);
    }

    private static Path requiredPath(Map<String, List<String>> options, String key) {
        String value = first(options, key, "");
        if (value.isBlank()) throw new IllegalArgumentException("Missing --" + key);
        return Path.of(value);
    }
}
