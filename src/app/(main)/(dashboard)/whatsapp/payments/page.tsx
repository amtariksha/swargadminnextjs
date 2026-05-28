"use client";

import { useState, useEffect } from "react";
import {
    IndianRupee,
    Plus,
    CheckCircle2,
    XCircle,
    Clock,
    CreditCard,
    Copy,
    Check,
    MoreHorizontal,
    ExternalLink,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/whatsapp/ui/badge";
import { Button } from "@/components/whatsapp/ui/button";
import { Card, CardContent } from "@/components/whatsapp/ui/card";
import { cn } from "@/lib/whatsapp/utils";
import { usePayments, useUpdatePayment, useSyncPayment, useSettings } from "@/lib/whatsapp/hooks";
import { PaymentLinkDialog } from "@/components/whatsapp/payments/payment-link-dialog";
import { formatDistanceToNow } from "date-fns";
import type { Payment } from "@/lib/whatsapp/types";

const statusConfig: Record<
    string,
    { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
    created: {
        label: "Created",
        color: "text-blue-700",
        bg: "bg-blue-100",
        icon: Clock,
    },
    paid: {
        label: "Paid",
        color: "text-emerald-700",
        bg: "bg-emerald-100",
        icon: CheckCircle2,
    },
    unpaid: {
        label: "Unpaid",
        color: "text-amber-700",
        bg: "bg-amber-100",
        icon: Clock,
    },
    cancelled: {
        label: "Cancelled",
        color: "text-red-700",
        bg: "bg-red-100",
        icon: XCircle,
    },
    expired: {
        label: "Expired",
        color: "text-slate-700",
        bg: "bg-slate-100",
        icon: XCircle,
    },
};

function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
    }).format(amount);
}

export default function PaymentsPage() {
    const [statusFilter, setStatusFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [markPaidId, setMarkPaidId] = useState<string | null>(null);
    const [transactionRef, setTransactionRef] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { data: settings } = useSettings();
    const pageSize = parseInt(settings?.payments_page_size || "20") || 20;
    const { data, isLoading } = usePayments({ status: statusFilter, page, limit: pageSize });
    const { mutate: updatePayment, isPending: isUpdating } = useUpdatePayment();
    const { mutate: syncPayment, isPending: isSyncing } = useSyncPayment();

    // Reset to page 1 when filter changes
    useEffect(() => {
        setPage(1);
    }, [statusFilter]);

    const payments = data?.payments || [];
    const total = data?.total || 0;
    const limit = data?.limit || 20;
    const totalPages = Math.ceil(total / limit);
    const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const showingTo = Math.min(page * limit, total);
    const summary = data?.summary || {
        created: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
        unpaid: { count: 0, total: 0 },
        cancelled: { count: 0, total: 0 },
    };

    const summaryCards = [
        {
            label: "CREATED",
            icon: Plus,
            count: summary.created.count,
            total: summary.created.total,
            color: "text-blue-600",
            border: "border-blue-200",
        },
        {
            label: "PAID",
            icon: CheckCircle2,
            count: summary.paid.count,
            total: summary.paid.total,
            color: "text-emerald-600",
            border: "border-emerald-200",
        },
        {
            label: "UNPAID",
            icon: Clock,
            count: summary.unpaid.count,
            total: summary.unpaid.total,
            color: "text-amber-600",
            border: "border-amber-200",
        },
        {
            label: "CANCELLED",
            icon: XCircle,
            count: summary.cancelled.count,
            total: summary.cancelled.total,
            color: "text-red-600",
            border: "border-red-200",
        },
    ];

    const handleMarkPaid = () => {
        if (!markPaidId) return;
        updatePayment(
            {
                id: markPaidId,
                paymentStatus: "paid",
                transactionRef: transactionRef.trim() || undefined,
            },
            {
                onSuccess: () => {
                    setMarkPaidId(null);
                    setTransactionRef("");
                },
            }
        );
    };

    const handleCopyLink = async (payment: Payment) => {
        const url = payment.shortUrl;
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(payment.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            // Fallback
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            setCopiedId(payment.id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white">
                            <IndianRupee className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Payments</h1>
                            <p className="text-sm text-slate-500">
                                Send payment links and track status
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setDialogOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Payment
                    </Button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {summaryCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Card
                                key={card.label}
                                className={cn("border", card.border)}
                            >
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Icon className={cn("w-4 h-4", card.color)} />
                                        <span className="text-[11px] font-semibold tracking-wider text-slate-500">
                                            {card.label}
                                        </span>
                                    </div>
                                    <p className="text-xl font-bold text-slate-900">
                                        {formatCurrency(card.total)}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        ({card.count})
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-2 mb-4">
                    {["all", "created", "paid", "unpaid", "cancelled"].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize",
                                statusFilter === s
                                    ? "bg-emerald-500 text-white"
                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            {s === "all" ? "All" : s}
                        </button>
                    ))}
                </div>

                {/* Payments Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-3">Contact Name</div>
                        <div className="col-span-2">Mobile Number</div>
                        <div className="col-span-2">Created At</div>
                        <div className="col-span-1">Amount</div>
                        <div className="col-span-1">Msg Status</div>
                        <div className="col-span-2">Payment Status</div>
                        <div className="col-span-1">Actions</div>
                    </div>

                    <div className="min-h-[400px]">
                        {isLoading && !payments.length ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                            </div>
                        ) : payments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                <CreditCard className="w-10 h-10 mb-3 opacity-40" />
                                <p className="text-sm font-medium">No payments yet</p>
                                <p className="text-xs mt-1">
                                    Click &ldquo;+ New Payment&rdquo; to create a payment link
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {payments.map((payment) => {
                                    const config = statusConfig[payment.paymentStatus] || statusConfig.created;
                                    const StatusIcon = config.icon;
                                    const isExpanded = expandedId === payment.id;
                                    return (
                                        <div key={payment.id}>
                                            <div
                                                className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-slate-50/50 transition-colors cursor-pointer"
                                                onClick={() => setExpandedId(isExpanded ? null : payment.id)}
                                            >
                                                <div className="col-span-3 text-sm font-medium text-slate-900 truncate">
                                                    {payment.contactName}
                                                </div>
                                                <div className="col-span-2 text-sm text-slate-600">
                                                    +{payment.phone}
                                                </div>
                                                <div className="col-span-2 text-xs text-slate-500">
                                                    {formatDistanceToNow(new Date(payment.createdAt), {
                                                        addSuffix: true,
                                                    })}
                                                </div>
                                                <div className="col-span-1 text-sm font-semibold text-slate-900">
                                                    {formatCurrency(payment.amount)}
                                                </div>
                                                <div className="col-span-1">
                                                    <Badge
                                                        variant="secondary"
                                                        className={cn(
                                                            "text-[10px] h-5",
                                                            payment.messageStatus === "sent"
                                                                ? "bg-emerald-100 text-emerald-700"
                                                                : "bg-slate-100 text-slate-500"
                                                        )}
                                                    >
                                                        {payment.messageStatus === "sent"
                                                            ? "✓ Sent"
                                                            : payment.messageStatus}
                                                    </Badge>
                                                </div>
                                                <div className="col-span-2">
                                                    <Badge
                                                        className={cn(
                                                            "text-[10px] h-6 gap-1 font-semibold",
                                                            config.bg,
                                                            config.color,
                                                            "border-0"
                                                        )}
                                                    >
                                                        <StatusIcon className="w-3 h-3" />
                                                        {config.label}
                                                    </Badge>
                                                </div>
                                                <div className="col-span-1 flex items-center justify-end gap-1">
                                                    {/* Copy Link */}
                                                    {payment.shortUrl && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopyLink(payment);
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            title="Copy payment link"
                                                        >
                                                            {copiedId === payment.id ? (
                                                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                            ) : (
                                                                <Copy className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                    {/* Mark as Paid */}
                                                    {payment.paymentStatus !== "paid" && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setMarkPaidId(payment.id);
                                                                setTransactionRef("");
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                            title="Mark as paid"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {/* Sync */}
                                                    {payment.razorpayLinkId && payment.paymentStatus !== "paid" && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                syncPayment(payment.id);
                                                            }}
                                                            disabled={isSyncing}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                                            title="Sync status with Razorpay"
                                                        >
                                                            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                                                        </button>
                                                    )}
                                                    {/* Expand */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedId(isExpanded ? null : payment.id);
                                                        }}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                                    >
                                                        <MoreHorizontal className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Row */}
                                            {isExpanded && (
                                                <div className="px-5 pb-4 bg-slate-50/50 border-t border-slate-100">
                                                    <div className="grid grid-cols-3 gap-4 py-3  text-xs">
                                                        <div>
                                                            <span className="text-slate-400 block mb-0.5">Description</span>
                                                            <span className="text-slate-700">{payment.description || "—"}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 block mb-0.5">Payment Link</span>
                                                            {payment.shortUrl ? (
                                                                <div className="flex items-center gap-2">
                                                                    <a
                                                                        href={payment.shortUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 hover:underline truncate max-w-[200px]"
                                                                    >
                                                                        {payment.shortUrl}
                                                                    </a>
                                                                    <button
                                                                        onClick={() => handleCopyLink(payment)}
                                                                        className="text-slate-400 hover:text-blue-600 flex-shrink-0"
                                                                    >
                                                                        {copiedId === payment.id ? (
                                                                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                                        ) : (
                                                                            <Copy className="w-3.5 h-3.5" />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-500">—</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 block mb-0.5">Transaction Ref</span>
                                                            <span className="text-slate-700">{payment.transactionRef || "—"}</span>
                                                        </div>
                                                    </div>
                                                    {payment.shortUrl && (
                                                        <div className="flex gap-2 mt-1">
                                                            <button
                                                                onClick={() => handleCopyLink(payment)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                                                            >
                                                                {copiedId === payment.id ? (
                                                                    <>
                                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                                        Copied!
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Copy className="w-3 h-3" />
                                                                        Copy Link
                                                                    </>
                                                                )}
                                                            </button>
                                                            <a
                                                                href={payment.shortUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                                Open Link
                                                            </a>
                                                            {payment.paymentStatus !== "paid" && (
                                                                <button
                                                                    onClick={() => {
                                                                        setMarkPaidId(payment.id);
                                                                        setTransactionRef("");
                                                                    }}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors"
                                                                >
                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                    Mark as Paid
                                                                </button>
                                                            )}
                                                            {/* Sync */}
                                                            {payment.razorpayLinkId && payment.paymentStatus !== "paid" && (
                                                                <button
                                                                    onClick={() => syncPayment(payment.id)}
                                                                    disabled={isSyncing}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                                                                >
                                                                    <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
                                                                    Sync Status
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                            <p className="text-sm text-slate-500">
                                Showing {showingFrom}–{showingTo} of {total}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-8 px-3 text-xs"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                                    Previous
                                </Button>
                                <span className="text-sm text-slate-600 tabular-nums">
                                    Page {page} of {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="h-8 px-3 text-xs"
                                >
                                    Next
                                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <PaymentLinkDialog open={dialogOpen} onOpenChange={setDialogOpen} />

            {/* Mark as Paid Dialog */}
            {markPaidId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 mx-4">
                        <div className="flex items-center gap-2 mb-4">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            <h2 className="text-lg font-semibold text-slate-800">
                                Mark as Paid
                            </h2>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Manually mark this payment as received. Optionally add transaction
                            details for reference.
                        </p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Transaction Reference / Details
                                </label>
                                <textarea
                                    autoFocus
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none min-h-[80px]"
                                    placeholder="e.g. UPI: 423872349823&#10;Bank transfer ref: NEFT230219&#10;Cash received by: Rahul"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Optional — add UPI ID, bank reference, cash note, etc.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setMarkPaidId(null)}
                                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleMarkPaid}
                                disabled={isUpdating}
                                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                                {isUpdating ? "Updating..." : "Confirm Paid"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
