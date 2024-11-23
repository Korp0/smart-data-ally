import React, { useEffect, useState } from "react";
import "./MainInterface.css";
import axios from "axios";

interface MainInterface {}

interface Dictionary<T> {
  [Key: string]: T;
}

interface ChatResponse {
  query: string;
  result: Dictionary<number>;
  humanized_response: string;
}

const MainInterface: React.FC<MainInterface> = () => {
  const [inputValue, setInputValue] = useState<string>("");
  const [chatResponses, setChatResponses] = useState<string[]>([]);
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [lastResponse, setLastResponse] = useState<ChatResponse>();
  const [responding, setResponding] = useState<boolean>();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  };

  const getDatasets = async (): Promise<void> => {
    axios
      .get("http://localhost:8000/datasets")
      .then((response) => {
        setAvailableDatasets(response.data.datasets);
        setSelectedDataset(response.data.datasets[0]);
      })
      .catch((err) => {
        console.log("Error fetching datasets: ", err);
      });
  };

  useEffect(() => {
    getDatasets();
  }, []);

  const handleSendBtnClick = async () => {
    if (!inputValue || !selectedDataset) {
      return;
    }

    await getAnswer(selectedDataset, inputValue);
  };

  const getAnswer = async (dataset: string, query: string): Promise<void> => {
    setResponding(true);
    setInputValue("");

    axios
      .post("http://localhost:8000/query", {
        dataset_name: dataset,
        user_query: query,
      })
      .then((response) => {
        if (response.status === 200) {
          setLastResponse(response.data);
          setChatResponses((prevResponses) => [
            ...prevResponses,
            response.data.humanized_response,
          ]);
        }
      })
      .catch((err) => {
        console.error("Error fetching: ", err.response.data);
      })
      .finally(() => {
        setResponding(false);
      });
  };

  const handleSelectChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    setSelectedDataset(e.target.value);
  };

  return (
    <div className="MainInterface">
      <div className="dropdown">
        <h3>Choose a dataset</h3>
        <select
          name="datasets"
          className="datasets"
          onChange={handleSelectChange}
        >
          {availableDatasets.map((dataset) => (
            <option value={dataset}>{dataset.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div className="interface">
        <div className="outputBox">
          <div className="outputText">
            <div className="responses">
              {chatResponses.map((response) => (
                <p>{response}</p>
              ))}
            </div>
          </div>
          <div className="outputVisual"></div>
        </div>
        <div className="inputBox">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Type your message here..."
            style={{
              padding: "10px",
              fontSize: "16px",
              borderRadius: "5px",
              border: "1px solid #ccc",
              width: "60%",
            }}
          />
          {!responding && inputValue?.length != 0 && (
            <button
              onClick={handleSendBtnClick}
              style={{
                padding: "10px 15px",
                fontSize: "16px",
                marginLeft: "10px",
                borderRadius: "5px",
                border: "1px solid #ccc",
                cursor: "pointer",
                backgroundColor: "magenta",
                color: "white",
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainInterface;
