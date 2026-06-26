import React, { useState } from 'react';
import api from '../services/api';
import './ExcelUpload.css';

const ExcelUpload = ({ 
  moduleName, 
  onUploadComplete, 
  onClose,
  templateEndpoint,
  hideImportMode = false,
}) => {
  const [file, setFile] = useState(null);
  const [importMode, setImportMode] = useState('both');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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

          {!hideImportMode && (
          <div className="import-mode-section">
            <label>Import Mode:</label>
            {moduleName === 'sales' && (
              <p className="import-mode-hint">
                Duplicates are matched by Amazon Order ID. Use Create Only to skip existing orders, or Create & Update to refresh them.
              </p>
            )}
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
          )}

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
              <h3>Import Results:</h3>
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
                {result.skipped > 0 && (
                  <div className="stat-item info">
                    <span className="stat-label">Skipped:</span>
                    <span className="stat-value">{result.skipped}</span>
                  </div>
                )}
                {result.totalRows != null && (
                  <div className="stat-item info">
                    <span className="stat-label">Total rows:</span>
                    <span className="stat-value">{result.totalRows}</span>
                  </div>
                )}
              </div>

              {result.errorSummary && Object.keys(result.errorSummary).length > 0 && (
                <div className="errors-list">
                  <h4>Error summary:</h4>
                  <div className="errors-scroll">
                    {Object.entries(result.errorSummary).map(([message, count]) => (
                      <div key={message} className="error-item">
                        <strong>{count}×</strong> {message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {result.errors && result.errors.length > 0 && (
                <div className="errors-list">
                  <h4>Row errors ({result.errors.length}{result.failed > result.errors.length ? '+' : ''}):</h4>
                  <div className="errors-scroll">
                    {result.errors.slice(0, 25).map((err, index) => (
                      <div key={index} className="error-item">
                        <strong>Row {err.row}:</strong> {err.field} — {err.message}
                      </div>
                    ))}
                    {result.errors.length > 25 && (
                      <div className="more-errors">
                        ... and {result.errors.length - 25} more errors shown in summary
                      </div>
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

