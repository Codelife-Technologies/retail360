import { createPortal } from 'react-dom';

function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default ModalPortal;
