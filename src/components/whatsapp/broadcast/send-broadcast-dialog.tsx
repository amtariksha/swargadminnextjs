"use client";

import { useState } from "react";
import {
    ChevronRight,
    Upload,
    FileText,
    Check,
    Users,
    Send,
    Download,
    X,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/whatsapp/ui/button";
import { Badge } from "@/components/whatsapp/ui/badge";
import { ScrollArea } from "@/components/whatsapp/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/whatsapp/ui/select";
import { cn, parseTemplateVariables } from "@/lib/whatsapp/utils";
import { useTemplates, useCreateBroadcast } from "@/lib/whatsapp/hooks";
import { useAppStore } from "@/lib/whatsapp/store";
import type { Template } from "@/lib/whatsapp/types";

interface RecipientRow {
    phone: string;
    variables: Record<string, string>;
}

type WizardStep = 1 | 2 | 3;

const steps = [
    { num: 1, label: "Template", icon: FileText },
    { num: 2, label: "Recipients", icon: Upload },
    { num: 3, label: "Review", icon: Send },
];

export function SendBroadcastDialog({ onClose }: { onClose: () => void }) {
    const { data: templates } = useTemplates();
    const activeNumber = useAppStore((s) => s.activeNumber);
    const numbers = useAppStore((s) => s.numbers);
    const createBroadcast = useCreateBroadcast();

    const [step, setStep] = useState<WizardStep>(1);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [selectedNumber, setSelectedNumber] = useState<string>(activeNumber?.number || numbers[0]?.number || "");
    const [recipientRows, setRecipientRows] = useState<RecipientRow[]>([]);
    const [csvFileName, setCsvFileName] = useState("");
    const [csvParseError, setCsvParseError] = useState("");

    const approvedTemplates = templates?.filter((t) => t.status?.toLowerCase() === "approved");

    const bodyComponent = selectedTemplate?.components.find((c) => c.type === "BODY");
    const templateVars = bodyComponent ? parseTemplateVariables(bodyComponent.text || "") : [];
    const varColumns = templateVars.map((v) => {
        const num = v.replace(/[{}]/g, "");
        return `var_${num}`;
    });

    const handleDownloadSample = () => {
        if (!selectedTemplate) return;
        const headers = ["phone", ...varColumns].join(",");
        const sampleRows = [
            ["919876543210", ...varColumns.map((_, i) => `sample_value_${i + 1}`)].join(","),
            ["918765432109", ...varColumns.map((_, i) => `example_${i + 1}`)].join(","),
        ];
        const csvContent = [headers, ...sampleRows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `broadcast_${selectedTemplate.name}_sample.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFileName(file.name);
        setCsvParseError("");

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

            if (lines.length === 0) {
                setCsvParseError("CSV file is empty");
                return;
            }

            const headerLine = lines[0];
            const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
            const phoneIdx = headers.findIndex(
                (h) => h === "phone" || h === "phone_number" || h === "number" || h === "mobile"
            );

            if (phoneIdx === -1) {
                const firstLineIsPhone = /^\+?\d[\d\s\-]+$/.test(lines[0]);
                const startIdx = firstLineIsPhone ? 0 : 1;
                const rows: RecipientRow[] = [];
                for (let i = startIdx; i < lines.length; i++) {
                    const phone = lines[i].split(",")[0].trim().replace(/^\+/, "").replace(/[\s\-]/g, "");
                    if (/^\d{10,15}$/.test(phone)) {
                        rows.push({ phone, variables: {} });
                    }
                }
                setRecipientRows(rows);
                if (rows.length === 0) setCsvParseError("No valid phone numbers found");
                return;
            }

            const varIdxMap: Record<string, number> = {};
            for (const vc of varColumns) {
                const idx = headers.indexOf(vc);
                if (idx !== -1) varIdxMap[vc] = idx;
            }

            const rows: RecipientRow[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const phone = (cols[phoneIdx] || "").trim().replace(/^\+/, "").replace(/[\s\-]/g, "");
                if (!/^\d{10,15}$/.test(phone)) continue;

                const variables: Record<string, string> = {};
                for (const [colName, colIdx] of Object.entries(varIdxMap)) {
                    const varNum = colName.replace("var_", "");
                    variables[`{{${varNum}}}`] = (cols[colIdx] || "").trim();
                }
                rows.push({ phone, variables });
            }

            setRecipientRows(rows);
            if (rows.length === 0) setCsvParseError("No valid rows found.");
        };
        reader.readAsText(file);
    };

    const handleSend = async () => {
        if (!selectedTemplate || recipientRows.length === 0) return;

        const hasPerRecipientVars = recipientRows.some((r) => Object.keys(r.variables).length > 0);
        const recipients = hasPerRecipientVars
            ? recipientRows.map((r) => ({ phone: r.phone, variables: r.variables }))
            : recipientRows.map((r) => r.phone);

        try {
            await createBroadcast.mutateAsync({
                templateId: selectedTemplate.name,
                templateLanguage: selectedTemplate.language,
                recipients,
                integratedNumber: selectedNumber || activeNumber?.number || numbers[0]?.number,
                csvFileName: csvFileName || undefined,
            });
            onClose();
        } catch {
            // error handled by mutation
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base font-semibold text-slate-900">Send Broadcast</h2>
                        {/* Step indicators */}
                        <div className="flex items-center gap-1 ml-2">
                            {steps.map((s, i) => {
                                const Icon = s.icon;
                                const isActive = step === s.num;
                                const isCompleted = step > s.num;
                                return (
                                    <div key={s.num} className="flex items-center gap-1">
                                        {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                        <div className={cn(
                                            "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                                            isActive ? "bg-emerald-50 text-emerald-700" :
                                            isCompleted ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                                        )}>
                                            {isCompleted ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                                            <span className="hidden sm:inline">{s.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto px-5 py-4">
                    {/* Number selector */}
                    {numbers.length > 1 && step === 1 && (
                        <div className="mb-4">
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Send from</label>
                            <Select value={selectedNumber} onValueChange={setSelectedNumber}>
                                <SelectTrigger className="w-full max-w-xs">
                                    <SelectValue placeholder="Select number" />
                                </SelectTrigger>
                                <SelectContent>
                                    {numbers.map((num) => (
                                        <SelectItem key={num.id} value={num.number}>
                                            {num.label} (+{num.number})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Step 1: Select Template */}
                    {step === 1 && (
                        <div>
                            <p className="text-sm font-medium text-slate-700 mb-3">Choose an Approved Template</p>
                            <ScrollArea className="max-h-[350px]">
                                <div className="space-y-2">
                                    {approvedTemplates?.length === 0 && (
                                        <p className="text-center py-8 text-sm text-slate-400">No approved templates found</p>
                                    )}
                                    {approvedTemplates?.map((tpl) => {
                                        const body = tpl.components.find((c) => c.type === "BODY");
                                        const isSelected = selectedTemplate?.id === tpl.id;
                                        return (
                                            <button
                                                key={tpl.id}
                                                onClick={() => {
                                                    setSelectedTemplate(tpl);
                                                    setRecipientRows([]);
                                                    setCsvFileName("");
                                                    setCsvParseError("");
                                                }}
                                                className={cn(
                                                    "w-full text-left p-3 rounded-xl border transition-colors",
                                                    isSelected
                                                        ? "border-emerald-300 bg-emerald-50"
                                                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-medium text-slate-900">
                                                        {tpl.name.replace(/_/g, " ")}
                                                    </span>
                                                    <Badge variant="secondary" className="text-[10px] h-5">{tpl.category}</Badge>
                                                </div>
                                                {body?.text && (
                                                    <p className="text-xs text-slate-500 line-clamp-2">{body.text}</p>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Step 2: Upload Recipients */}
                    {step === 2 && (
                        <div>
                            {/* Template info */}
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 mb-4">
                                <p className="text-xs text-slate-600 font-medium">Template: {selectedTemplate?.name.replace(/_/g, " ")}</p>
                                {templateVars.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <span className="text-[10px] text-slate-400">Variables:</span>
                                        {templateVars.map((v) => (
                                            <span key={v} className="inline-flex px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-mono rounded">{v}</span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Download sample */}
                            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
                                <Download className="w-5 h-5 text-blue-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-blue-800">Download Sample CSV</p>
                                    <p className="text-xs text-blue-600 mt-0.5">
                                        {templateVars.length > 0
                                            ? `Columns: phone, ${varColumns.join(", ")}`
                                            : "Column: phone"}
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleDownloadSample}
                                    className="shrink-0 border-blue-200 text-blue-700 hover:bg-blue-100">
                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                    Download
                                </Button>
                            </div>

                            {/* CSV Upload */}
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center mb-4 hover:border-emerald-300 transition-colors">
                                <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" id="csv-upload-dialog" />
                                <label htmlFor="csv-upload-dialog" className="cursor-pointer">
                                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-slate-600">
                                        {csvFileName || "Click to upload CSV"}
                                    </p>
                                </label>
                            </div>

                            {csvParseError && (
                                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">{csvParseError}</div>
                            )}

                            {recipientRows.length > 0 && (
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="w-4 h-4 text-emerald-600" />
                                        <span className="text-sm font-medium text-slate-700">{recipientRows.length} recipients loaded</span>
                                    </div>
                                    <ScrollArea className="max-h-[150px]">
                                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-3 py-2 text-left font-medium text-slate-600">#</th>
                                                        <th className="px-3 py-2 text-left font-medium text-slate-600">Phone</th>
                                                        {varColumns.map((vc) => (
                                                            <th key={vc} className="px-3 py-2 text-left font-medium text-slate-600">{vc}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recipientRows.slice(0, 5).map((row, i) => (
                                                        <tr key={i} className="border-b border-slate-100 last:border-0">
                                                            <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                                                            <td className="px-3 py-1.5 text-slate-700 font-mono">{row.phone}</td>
                                                            {varColumns.map((vc) => {
                                                                const varNum = vc.replace("var_", "");
                                                                return (
                                                                    <td key={vc} className="px-3 py-1.5 text-slate-600">
                                                                        {row.variables[`{{${varNum}}}`] || <span className="text-slate-300">&mdash;</span>}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {recipientRows.length > 5 && (
                                                <div className="px-3 py-2 bg-slate-50 text-xs text-slate-400 text-center border-t border-slate-200">
                                                    ...and {recipientRows.length - 5} more
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                        <div>
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 mb-4 space-y-2">
                                <p className="text-sm font-medium text-emerald-800">Campaign Summary</p>
                                <div className="space-y-1.5 text-xs text-emerald-700">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>Template: <strong>{selectedTemplate?.name.replace(/_/g, " ")}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Send className="w-3.5 h-3.5" />
                                        <span>From: <strong>{
                                            (selectedNumber || activeNumber?.number || numbers[0]?.number)
                                                ? `+${selectedNumber || activeNumber?.number || numbers[0]?.number}`
                                                : "(auto)"
                                        }</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Users className="w-3.5 h-3.5" />
                                        <span>Recipients: <strong>{recipientRows.length}</strong></span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <p className="text-xs font-medium text-slate-600 mb-1">Message Preview</p>
                                <p className="text-xs text-slate-500 whitespace-pre-wrap">{bodyComponent?.text}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    {step > 1 ? (
                        <Button variant="outline" size="sm" onClick={() => setStep((s) => (s - 1) as WizardStep)}>Back</Button>
                    ) : (
                        <div />
                    )}
                    {step < 3 ? (
                        <Button
                            size="sm"
                            onClick={() => setStep((s) => (s + 1) as WizardStep)}
                            disabled={step === 1 ? !selectedTemplate : recipientRows.length === 0}
                            className="bg-emerald-500 hover:bg-emerald-600 gap-1"
                        >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            onClick={handleSend}
                            disabled={recipientRows.length === 0 || createBroadcast.isPending}
                            className="bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                        >
                            {createBroadcast.isPending ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>
                            ) : (
                                <><Send className="w-3.5 h-3.5" />Send to {recipientRows.length} Recipients</>
                            )}
                        </Button>
                    )}
                </div>

                {/* Error */}
                {createBroadcast.isError && (
                    <div className="px-5 py-2 bg-red-50 text-sm text-red-700 border-t border-red-100">
                        {(createBroadcast.error as Error).message}
                    </div>
                )}
            </div>
        </div>
    );
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}
