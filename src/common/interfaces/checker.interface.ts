export interface Checker {
    id: string;
    serial: string;
    pin: string;
    waec_type: 'BECE' | 'WASSCE' | 'NOVDEC';
    order_id?: string;
    created_at: string;

  }