export class InternalServerError extends Error {
  private item: string;
  private resultCode: number;

  constructor(message: string, item: string = '') {
    super(message);
    this.name = 'InternalServerError';
    this.item = item;
    this.resultCode = 500;

    // 로그 남기기
    console.error(`[InternalServerError] ${new Date().toISOString()}`);
    console.error(`- Message: ${message}`);
    console.error(`- Item: ${item}`);
    console.error(`- Code: ${this.resultCode}`);
  }

  public getItem(): string {
    return this.item;
  }

  public getResultCode(): number {
    return this.resultCode;
  }
}
