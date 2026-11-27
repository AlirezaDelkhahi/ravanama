import type { BookingStatus } from "@/lib/mock-data";

export type StatusVariant = "confirmed" | "pending" | "rejected" | "info";

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

const DEFAULT_LABELS: Record<StatusVariant, string> = {
  confirmed: "تاییدشده",
  pending: "در انتظار تایید درمانگر",
  rejected: "ردشده",
  info: "اطلاعیه",
};

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  confirmed:
    "bg-status-confirmed-bg text-status-confirmed-ink border-status-confirmed-border",
  pending:
    "bg-status-pending-bg text-status-pending-ink border-status-pending-border",
  rejected:
    "bg-status-rejected-bg text-status-rejected-ink border-status-rejected-border",
  info: "bg-status-info-bg text-status-info-ink border-status-info-border",
};

export function statusVariantFromBooking(status: BookingStatus): {
  variant: StatusVariant;
  label: string;
} {
  switch (status) {
    case "confirmed":
      return { variant: "confirmed", label: "تاییدشده" };
    case "completed":
      return { variant: "info", label: "برگزارشده" };
    case "pending_verification":
      return { variant: "pending", label: "در انتظار تایید درمانگر" };
    case "held":
      return { variant: "pending", label: "رزرو موقت ۱۵ دقیقه‌ای" };
    case "rejected":
      return { variant: "rejected", label: "نیازمند اصلاح رسید" };
    case "expired":
      return { variant: "rejected", label: "منقضی‌شده" };
    case "cancelled":
      return { variant: "rejected", label: "لغوشده" };
  }
}

export function StatusBadge({ variant, label, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs sm:text-sm font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
        aria-hidden="true"
      />
      <span>{label ?? DEFAULT_LABELS[variant]}</span>
    </span>
  );
}
