import { grnAPI } from '../services/grnApi';

export async function openGrnPdf(grnId) {
  const res = await grnAPI.getPdf(grnId);
  const w = window.open('', '_blank');
  w.document.write(res.data);
  w.document.close();
}
