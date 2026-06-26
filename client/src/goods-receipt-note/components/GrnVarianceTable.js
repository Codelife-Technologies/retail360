import React from 'react';

function GrnVarianceTable({ items = [] }) {
  if (!items.length) return null;

  return (
    <section className="grn-section">
      <h3>Variance Analysis</h3>
      <div className="grn-table-wrap">
        <table className="grn-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Accepted</th>
              <th>Difference</th>
              <th>Variance %</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line, idx) => {
              const diff = (line.acceptedQty || 0) - (line.orderedQty || 0);
              const pct = line.orderedQty ? ((diff / line.orderedQty) * 100).toFixed(1) : '0.0';
              const isVariance = diff !== 0;
              return (
                <tr key={line._id || idx} className={isVariance ? 'variance-row' : ''}>
                  <td className="mono">{line.sku}</td>
                  <td>{line.productName || line.product?.title}</td>
                  <td>{line.orderedQty}</td>
                  <td>{line.receivedQty}</td>
                  <td>{line.acceptedQty}</td>
                  <td className={diff < 0 ? 'shortage' : diff > 0 ? 'excess' : ''}>{diff}</td>
                  <td>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default GrnVarianceTable;
