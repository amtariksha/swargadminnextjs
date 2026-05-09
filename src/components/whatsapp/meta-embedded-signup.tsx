"use client";
import { wfetch } from "@/lib/whatsapp/wfetch";

import { useState } from "react";
import { Loader2 } from "lucide-react";

declare global {
    interface Window {
        FB: {
            init: (params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
            login: (
                callback: (response: { authResponse?: { code?: string } }) => void,
                options: Record<string, unknown>
            ) => void;
        };
        fbAsyncInit: () => void;
    }
}

interface MetaEmbeddedSignupProps {
    onSuccess: () => void;
    configId?: string;
}

export function MetaEmbeddedSignup({ onSuccess, configId }: MetaEmbeddedSignupProps) {
    const [status, setStatus] = useState<"idle" | "loading" | "sdk_loading" | "processing" | "success" | "error">("idle");
    const [error, setError] = useState("");
    const [inputConfigId, setInputConfigId] = useState(configId || "");

    const loadFBSDK = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (window.FB) {
                resolve();
                return;
            }

            window.fbAsyncInit = () => {
                // FB.init will be called after we fetch the app ID
                resolve();
            };

            // Check if SDK script is already present
            if (document.getElementById("facebook-jssdk")) {
                // Script exists but FB not ready yet, wait
                const checkFB = setInterval(() => {
                    if (window.FB) {
                        clearInterval(checkFB);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkFB);
                    reject(new Error("Facebook SDK timed out"));
                }, 10000);
                return;
            }

            const script = document.createElement("script");
            script.id = "facebook-jssdk";
            script.src = "https://connect.facebook.net/en_US/sdk.js";
            script.async = true;
            script.defer = true;
            script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
            document.body.appendChild(script);

            // Timeout after 15 seconds
            setTimeout(() => reject(new Error("Facebook SDK load timed out")), 15000);
        });
    };

    const handleConnect = async () => {
        if (!inputConfigId.trim()) {
            setError("Please enter a Configuration ID from your Meta Business account");
            return;
        }

        setError("");
        setStatus("sdk_loading");

        try {
            // Fetch facebook app ID from settings
            const settingsRes = await wfetch("/api/whatsapp/settings");
            const settings = await settingsRes.json();
            const appId = settings.facebook_app_id;
            const apiVersion = settings.meta_api_version || "v21.0";

            if (!appId) {
                setError("Facebook App ID not configured. Set it in Settings → General.");
                setStatus("idle");
                return;
            }

            // Load the FB SDK
            await loadFBSDK();

            // Initialize
            window.FB.init({
                appId,
                autoLogAppEvents: true,
                xfbml: false,
                version: apiVersion,
            });

            setStatus("loading");

            // Launch Embedded Signup login
            // NOTE: FB.login callback must be a regular function, not async
            window.FB.login(
                (response) => {
                    const code = response.authResponse?.code;
                    if (!code) {
                        setError("Facebook login was cancelled or failed");
                        setStatus("idle");
                        return;
                    }

                    setStatus("processing");

                    wfetch("/api/whatsapp/meta/onboard", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code, configId: inputConfigId.trim() }),
                    })
                        .then((onboardRes) =>
                            onboardRes.json().then((result) => ({ ok: onboardRes.ok, result }))
                        )
                        .then(({ ok, result }) => {
                            if (!ok) {
                                setError(result.error || "Onboarding failed");
                                setStatus("error");
                                return;
                            }
                            setStatus("success");
                            onSuccess();
                        })
                        .catch(() => {
                            setError("Network error during onboarding");
                            setStatus("error");
                        });
                },
                {
                    config_id: inputConfigId.trim(),
                    response_type: "code",
                    override_default_response_type: true,
                    extras: {
                        setup: {},
                        featureType: "",
                        sessionInfoVersion: "3",
                    },
                }
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load Facebook SDK");
            setStatus("idle");
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meta Embedded Signup Configuration ID
                </label>
                <input
                    type="text"
                    value={inputConfigId}
                    onChange={(e) => setInputConfigId(e.target.value)}
                    placeholder="e.g. 123456789012345"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-[11px] font-semibold text-blue-800 mb-1">How to get this ID:</p>
                    <ol className="text-[11px] text-blue-700 space-y-0.5 list-decimal list-inside">
                        <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline font-medium">developers.facebook.com/apps</a></li>
                        <li>Select your app → <strong>WhatsApp</strong> → <strong>Quickstart</strong> (or <strong>Getting Started</strong>)</li>
                        <li>Under <strong>Embedded Signup</strong>, create or select a configuration</li>
                        <li>Copy the <strong>Configuration ID</strong> (a numeric string like 123456789012345)</li>
                    </ol>
                </div>
            </div>

            {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {error}
                </div>
            )}

            {status === "success" ? (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                    WhatsApp number connected successfully via Meta Embedded Signup!
                </div>
            ) : (
                <button
                    onClick={handleConnect}
                    disabled={status !== "idle" && status !== "error"}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                    {(status === "sdk_loading" || status === "loading" || status === "processing") && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {status === "sdk_loading" && "Loading Meta SDK..."}
                    {status === "loading" && "Waiting for Meta..."}
                    {status === "processing" && "Setting up number..."}
                    {(status === "idle" || status === "error") && "Connect via Meta"}
                </button>
            )}
        </div>
    );
}
