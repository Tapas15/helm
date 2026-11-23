export declare const REDACT_PATHS: readonly ["req.headers.authorization", "req.headers.cookie", "request.headers.authorization", "request.headers.cookie", "headers.authorization", "headers.cookie", "authorization", "cookie", "set-cookie", "password", "passwd", "secret", "token", "accessToken", "refreshToken", "apiKey", "apikey", "credential", "credentials", "privateKey", "clientSecret", "*.authorization", "*.cookie", "*.set-cookie", "*.password", "*.passwd", "*.secret", "*.token", "*.accessToken", "*.refreshToken", "*.apiKey", "*.apikey", "*.credential", "*.credentials", "*.privateKey", "*.clientSecret"];
export declare const REDACT_CENSOR = "[REDACTED]";
export declare function buildRedactConfig(): {
    paths: string[];
    censor: string;
};
//# sourceMappingURL=redaction.d.ts.map