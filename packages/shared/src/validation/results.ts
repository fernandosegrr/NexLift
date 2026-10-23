export interface ValidationIssue { path: string; message: string }
export class ContractValidationError extends Error {
    readonly issues: readonly ValidationIssue[];
    constructor(readonly code: string, path: string, message: string) {
        super(message);
        this.name = 'ContractValidationError';
        this.issues = [{ path, message }];
    }
}
export type ValidationResult<T> = { success: true; data: T } | { success: false; issues: readonly ValidationIssue[] };
export function validate<T>(parser: (value: unknown) => T, value: unknown): ValidationResult<T> {
    try { return { success: true, data: parser(value) }; }
    catch (error) {
        if (error instanceof ContractValidationError) return { success: false, issues: error.issues };
        throw error;
    }
}
