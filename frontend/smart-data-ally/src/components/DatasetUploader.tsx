import React, { useState } from "react";
import "./DatasetUploader.css";
import axios from "axios";

interface DatasetUploaderProps {
  onUpload: () => void;
}

const DatasetUploader: React.FC<DatasetUploaderProps> = ({ onUpload }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Please select a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await axios.post(
        "http://localhost:8000/upload-dataset",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      alert(response.data.message || "File uploaded successfully!");
      onUpload();
    } catch (err) {
      console.error(err);
      alert("An error occurred while uploading the dataset.");
    }
  };

  return (
    <div className="DatasetUploader">
      <h3>Upload Your Dataset</h3>
      <div className="file-input-wrapper">
        <input
          type="file"
          id="file-upload"
          accept=".csv"
          onChange={handleFileChange}
        />
        <label htmlFor="file-upload">
          {selectedFile ? selectedFile.name : "Choose a file..."}
        </label>
      </div>
      <button className="upload-button" onClick={handleUpload}>
        UPLOAD
      </button>
    </div>
  );
};

export default DatasetUploader;
