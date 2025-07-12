export class CheckerDto {
  serial: string;
  pin: string;
  waec_type: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET';
}

export class StockAvailabilityDto {
  waec_type: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET';
  count: number;
}

export class CheckerAvailabilityResponseDto {
  statusCode: number;
  message: string;
  count: number;
  data: StockAvailabilityDto[] | CheckerDto[];
}