"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/whatsapp/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/whatsapp/ui/tooltip";

interface SessionTimerProps {
    lastIncomingTimestamp: string;
    className?: string;
    showLabel?: boolean;
}

export function SessionTimer({ lastIncomingTimestamp, className, showLabel = true }: SessionTimerProps) {
    const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number } | null>(null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (!lastIncomingTimestamp) {
                setTimeLeft(null);
                return;
            }

            const last = new Date(lastIncomingTimestamp).getTime();
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            const expiry = last + twentyFourHours;
            const remaining = expiry - now;

            if (remaining <= 0) {
                setTimeLeft(null);
                setProgress(100);
                return;
            }

            const totalMinutes = remaining / (1000 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.floor(totalMinutes % 60);

            setTimeLeft({ hours, minutes });

            // Calculate progress (0 to 100, where 100 is expired)
            // Start at 0 (full time) -> 100 (expired)
            const elapsedTime = now - last;
            const percentage = Math.min((elapsedTime / twentyFourHours) * 100, 100);
            setProgress(percentage);
        };

        calculateTimeLeft();
        const interval = setInterval(calculateTimeLeft, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [lastIncomingTimestamp]);

    if (!timeLeft) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={cn("w-3 h-3 rounded-full bg-slate-200", className)} />
                </TooltipTrigger>
                <TooltipContent>Session expired</TooltipContent>
            </Tooltip>
        );
    }

    const isWarning = timeLeft.hours < 4;
    const isCritical = timeLeft.hours < 1;

    // Calculate circle path
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className={cn("flex items-center gap-2", className)}>
                    <div className="relative w-5 h-5 flex items-center justify-center">
                        {/* Background circle */}
                        <svg className="transform -rotate-90 w-5 h-5">
                            <circle
                                cx="10"
                                cy="10"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                className="text-slate-100"
                            />
                            {/* Progress circle */}
                            <circle
                                cx="10"
                                cy="10"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                className={cn(
                                    "transition-all duration-500 ease-in-out",
                                    isCritical ? "text-red-500" : isWarning ? "text-amber-500" : "text-emerald-500"
                                )}
                            />
                        </svg>
                    </div>
                    {showLabel && (
                        <span className={cn(
                            "text-xs font-medium tabular-nums",
                            isCritical ? "text-red-600" : isWarning ? "text-amber-600" : "text-slate-600"
                        )}>
                            {timeLeft.hours}h {timeLeft.minutes}m
                        </span>
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent>
                Time remaining in 24h session
            </TooltipContent>
        </Tooltip>
    );
}
