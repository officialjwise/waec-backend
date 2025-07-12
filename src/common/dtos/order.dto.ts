export class InitiateOrderDto {
  waec_type: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET';
  quantity: number;
  phone: string;
  email?: string;
}

export class OrderResponseDto {
  message: string;
  order_id: string;
  checkers?: { serial: string; pin: string; waec_type: string }[];
  redirect_url: string;
  status: 'success' | 'failed';
}