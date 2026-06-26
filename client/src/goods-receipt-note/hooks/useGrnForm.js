import { useState, useCallback } from 'react';
import { emptyDeliveryInfo, emptyFollowUp } from '../types/grn.types';

export function useGrnForm(initial = {}) {
  const [deliveryInfo, setDeliveryInfo] = useState(initial.deliveryInfo || emptyDeliveryInfo());
  const [followUp, setFollowUp] = useState(initial.followUp || emptyFollowUp());
  const [items, setItems] = useState(initial.items || []);

  const updateDelivery = useCallback((field, value) => {
    setDeliveryInfo((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateFollowUp = useCallback((field, value) => {
    setFollowUp((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateItem = useCallback((index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: typeof value === 'number' ? value : parseFloat(value) || 0,
      };
      return next;
    });
  }, []);

  const toPayload = useCallback(
    () => ({
      deliveryInfo,
      followUp,
      items,
    }),
    [deliveryInfo, followUp, items]
  );

  return {
    deliveryInfo,
    setDeliveryInfo,
    followUp,
    setFollowUp,
    items,
    setItems,
    updateDelivery,
    updateFollowUp,
    updateItem,
    toPayload,
  };
}
