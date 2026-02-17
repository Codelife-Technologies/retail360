import React, { useState } from 'react';
import api from '../services/api';
import './ExcelUpload.css';

const ERRORS_VISIBLE_INITIAL = 25;

const ExcelUpload = ({ 
  moduleName, 
  onUploadComplete, 
  onClose,
  templateEndpoint 
}) => {
  const [file, setFile] = useState(null);
  const [importMode, setImportMode] = useState('both');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [filterLogFailedOnly, setFilterLogFailedOnly] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validExtensions = ['.xlsx', '.xls'];
      const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setResult(null);
      setShowAllErrors(false);
      setFilterLogFailedOnly(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validExtensions = ['.xlsx', '.xls'];
      const fileExtension = droppedFile.name.substring(droppedFile.name.lastIndexOf('.')).toLowerCase();
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        setFile(null);
        return;
      }
      
      setFile(droppedFile);
      setError(null);
      setResult(null);
      setShowAllErrors(false);
      setFilterLogFailedOnly(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setError(null);
      const response = await api.get(templateEndpoint, {
        responseType: 'blob'
      });
      
      // Check if response is actually an error (sometimes errors come as blobs)
      if (response.data instanceof Blob && response.data.type === 'application/json') {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        setError('Failed to download template: ' + (errorData.error || errorData.message || 'Unknown error'));
        return;
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${moduleName}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template download error:', error);
      let errorMessage = 'Failed to download template';
      if (error.response) {
        if (error.response.data instanceof Blob) {
          try {
            const text = await error.response.data.text();
            const errorData = JSON.parse(text);
            errorMessage += ': ' + (errorData.error || errorData.message || 'Server error');
          } catch (e) {
            errorMessage += ': Server error (status ' + error.response.status + ')';
          }
        } else {
          errorMessage += ': ' + (error.response.data?.error || error.response.data?.message || 'Server error');
        }
      } else {
        errorMessage += ': ' + error.message;
      }
      setError(errorMessage);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', importMode);

      const response = await api.post(
        `/${moduleName}/import`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percentCompleted);
          }
        }
      );

      setResult(response.data);
      setUploading(false);
      
      if (onUploadComplete) {
        onUploadComplete(response.data);
      }
    } catch (error) {
      setError(error.response?.data?.error || error.message || 'Upload failed');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="excel-upload-modal">
      <div className="excel-upload-content">
        <div className="excel-upload-header">
          <h2>Upload Excel File</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="excel-upload-body">
          <div className="template-section">
            <button 
              className="download-template-btn"
              onClick={handleDownloadTemplate}
            >
              Download Template
            </button>
          </div>

          <div 
            className="file-drop-zone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-input"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-input" className="file-input-label">
              {file ? (
                <div className="file-selected">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file.name}</span>
                  <button 
                    className="remove-file-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      document.getElementById('file-input').value = '';
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="file-drop-content">
                  <span className="file-icon">📁</span>
                  <p>Drag & drop file here or click to browse</p>
                  <p className="file-hint">Supports .xlsx and .xls files</p>
                </div>
              )}
            </label>
          </div>

          <div className="import-mode-section">
            <label>Import Mode:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="create"
                  checked={importMode === 'create'}
                  onChange={(e) => setImportMode(e.target.value)}
                />
                Create Only
              </label>
              <label>
                <input
                  type="radio"
                  value="update"
                  checked={importMode === 'update'}
                  onChange={(e) => setImportMode(e.target.value)}
                />
                Update Existing
              </label>
              <label>
                <input
                  type="radio"
                  value="both"
                  checked={importMode === 'both'}
                  onChange={(e) => setImportMode(e.target.value)}
                />
                Create & Update
              </label>
            </div>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <span>{uploadProgress}%</span>
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {result && (
            <div className="result-message">
              {result.summary && (
                <p className={`result-summary ${result.failed > 0 ? 'has-failures' : ''}`}>{result.summary}</p>
              )}
              <div className="result-stats">
                <div className="stat-item success">
                  <span className="stat-label">Imported:</span>
                  <span className="stat-value">{result.imported || 0}</span>
                </div>
                <div className="stat-item info">
                  <span className="stat-label">Updated:</span>
                  <span className="stat-value">{result.updated || 0}</span>
                </div>
                <div className="stat-item error">
                  <span className="stat-label">Failed:</span>
                  <span className="stat-value">{result.failed || 0}</span>
                </div>
              </div>

              {result.failedRows && result.failedRows.length > 0 && (
                <div className="failed-rows-hint">
                  <strong>Failed Excel rows:</strong> {result.failedRows.join(', ')}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="errors-list errors-list-prominent">
                  <h4>Why it failed ({result.errors.length} error{result.errors.length !== 1 ? 's' : ''})</h4>
                  <div className="errors-scroll">
                    {(showAllErrors ? result.errors : result.errors.slice(0, ERRORS_VISIBLE_INITIAL)).map((err, index) => (
                      <div key={index} className="error-item">
                        <span className="error-row">Row {err.row}</span>
                        <span className="error-field">{err.field}</span>
                        <span className="error-message-text">{err.message}</span>
                        {err.details && <span className="error-details"> ({err.details})</span>}
                      </div>
                    ))}
                    {result.errors.length > ERRORS_VISIBLE_INITIAL && !showAllErrors && (
                      <button
                        type="button"
                        className="show-more-errors-btn"
                        onClick={() => setShowAllErrors(true)}
                      >
                        Show all {result.errors.length} errors
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {result.uploadLog && result.uploadLog.length > 0 && (
                <div className="upload-log-section">
                  <div className="upload-log-header">
                    <h4>Upload Log ({filterLogFailedOnly ? result.uploadLog.filter(e => e.action === 'failed').length + ' failed' : result.uploadLog.length + ' rows'})</h4>
                    {result.failed > 0 && (
                      <label className="filter-failed-checkbox">
                        <input
                          type="checkbox"
                          checked={filterLogFailedOnly}
                          onChange={(e) => setFilterLogFailedOnly(e.target.checked)}
                        />
                        Show failed only
                      </label>
                    )}
                  </div>
                  <div className="upload-log-scroll">
                    <table className="upload-log-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>SKU</th>
                          <th>Action</th>
                          <th>SR No</th>
                          <th>Why failed / Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(filterLogFailedOnly ? result.uploadLog.filter(e => e.action === 'failed') : result.uploadLog)
                          .slice(0, 100)
                          .map((entry, index) => (
                          <tr key={index} className={`log-row-${entry.action}`}>
                            <td>{entry.row}</td>
                            <td>{entry.name || '-'}</td>
                            <td>{entry.sku || '-'}</td>
                            <td>
                              <span className={`log-action ${entry.action}`}>{entry.action}</span>
                            </td>
                            <td>{entry.slno || '-'}</td>
                            <td className="log-details-cell">{entry.message || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(filterLogFailedOnly ? result.uploadLog.filter(e => e.action === 'failed') : result.uploadLog).length > 100 && (
                      <div className="more-log-entries">... and more entries (filter or check backend log)</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="excel-upload-footer">
          <button 
            className="cancel-btn"
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </button>
          <button 
            className="upload-btn"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExcelUpload;

