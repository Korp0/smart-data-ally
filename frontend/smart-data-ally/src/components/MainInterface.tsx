import React, { useEffect, useState, useRef } from "react";
import "./MainInterface.css";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import DatasetUploader from "./DatasetUploader";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface MainInterface {}

interface Dictionary<T> {
  [Key: string]: T;
}

interface Visualization {
  chart_type: string | null; // e.g., "bar", "line", etc.
  data_points:
    | {
        name: string; // X-axis labels
        value: number; // Y-axis values
      }[]
    | null;
}

interface ChatResponse {
  query: string;
  result: Dictionary<number>;
  humanized_response: string;
  visualization?: Visualization;
}

enum Messenger {
  CHAT = 0,
  USER = 1,
}

interface ChatMessage {
  from: Messenger;
  content: string;
  time: string;
}

const MainInterface: React.FC<MainInterface> = () => {
  const [inputValue, setInputValue] = useState<string>("");
  const [chatResponses, setChatResponses] = useState<ChatMessage[]>([]);
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [lastResponse, setLastResponse] = useState<ChatResponse>();
  const [responding, setResponding] = useState<boolean>();

  const messageEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatResponses]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  };

  const getDatasets = async (): Promise<void> => {
    try {
      const response = await axios.get("http://localhost:8000/datasets");
      const datasets = response.data.datasets;

      setAvailableDatasets(datasets);

      if (datasets.length > 0) {
        setSelectedDataset(datasets[0]);
        await getColumnSummary(datasets[0]);
      }
    } catch (err) {
      console.error("Error fetching datasets:", err);
    }
  };

  const getColumnSummary = async (dataset: string): Promise<void> => {
    axios
      .get("http://localhost:8000/preview/" + dataset)
      .then((response) => {
        const newMessage: ChatMessage = {
          from: Messenger.CHAT,
          content: response.data.columns_summary,
          time: getCurrentTime(),
        };

        setChatResponses((prevResponses) => {
          const exists = prevResponses.some(
            (msg) =>
              msg.content === newMessage.content && msg.time === newMessage.time
          );

          if (!exists) {
            return [...prevResponses, newMessage];
          }
          return prevResponses;
        });
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

  const getCurrentTime = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0"); // Ensures 2 digits
    const minutes = String(now.getMinutes()).padStart(2, "0"); // Ensures 2 digits
    return `${hours}:${minutes}`;
  };

  const getAnswer = async (dataset: string, query: string): Promise<void> => {
    const newChatMessage: ChatMessage = {
      from: Messenger.USER,
      content: query,
      time: getCurrentTime(),
    };

    setChatResponses((prevResponses) => [...prevResponses, newChatMessage]);

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
          const newChatResponse: ChatMessage = {
            from: Messenger.CHAT,
            content: response.data.humanized_response,
            time: getCurrentTime(),
          };

          setChatResponses((prevResponses) => {
            const exists = prevResponses.some(
              (msg) =>
                msg.content === newChatResponse.content &&
                msg.time === newChatResponse.time
            );

            if (!exists) {
              return [...prevResponses, newChatResponse];
            }
            return prevResponses;
          });
        }
      })
      .catch((err) => {
        console.error(err);
        const newChatResponse: ChatMessage = {
          from: Messenger.CHAT,
          content:
            "Sorry, but unknown error has occurred. Either I don't have information to answer you, or an internal error happened.",
          time: getCurrentTime(),
        };

        setChatResponses((prevResponses) => [
          ...prevResponses,
          newChatResponse,
        ]);
      })
      .finally(() => {
        setResponding(false);
      });
  };

  const handleSelectChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    setSelectedDataset(e.target.value);

    const newChatMessage: ChatMessage = {
      from: Messenger.CHAT,
      content: "Switched dataset to: " + e.target.value.toUpperCase(),
      time: getCurrentTime(),
    };

    setChatResponses((prevResponses) => [...prevResponses, newChatMessage]);

    getColumnSummary(e.target.value);
  };

  const renderVisualization = (): JSX.Element | null => {
    if (
      !lastResponse ||
      !lastResponse.visualization ||
      !lastResponse.visualization.data_points
    ) {
      return null;
    }

    const { chart_type, data_points } = lastResponse.visualization;

    if (!chart_type || !data_points) {
      return null;
    }

    const labels = data_points.map((point) => point.name);
    const values = data_points.map((point) => point.value);

    const chartData = {
      labels, // X-axis labels
      datasets: [
        {
          label: "Data Visualization", // Chart title
          data: values, // Y-axis values
          backgroundColor: "rgba(75, 192, 192, 0.2)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: "top" as const,
        },
        title: {
          display: true,
          text: "Chart Visualization",
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Name",
          },
        },
        y: {
          title: {
            display: true,
            text: "Value",
          },
        },
      },
    };

    return chart_type === "bar" ? (
      <Bar data={chartData} options={options} />
    ) : chart_type === "line" ? (
      <Line data={chartData} options={options} />
    ) : (
      <p>Unsupported chart type: {chart_type}</p>
    );
  };

  return (
    <div className="MainInterface">
      <div className="datasetWrapper">
        <div className="dropdown">
          <h3>Dataset</h3>
          <select
            name="datasets"
            className="datasets"
            onChange={handleSelectChange}
          >
            {availableDatasets.map((dataset) => (
              <option value={dataset} key={dataset}>
                {dataset.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <DatasetUploader onUpload={getDatasets} />
      </div>
      <div className="interface">
        <div className="outputBox">
          <div className="outputText">
            <div className="responses">
              {chatResponses.map((response, index) => (
                <div
                  className="Message"
                  style={{
                    textAlign:
                      response.from === Messenger.USER ? "right" : "left",
                    borderBottomColor:
                      response.from === Messenger.CHAT ? "gray" : "transparent",
                  }}
                >
                  <h2 key={index}>{response.time}</h2>
                  <p key={index}>{response.content}</p>
                  <div ref={messageEndRef} />
                </div>
              ))}
            </div>
          </div>
          <div className="outputVisual">{}</div>
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
          {!responding && inputValue?.length !== 0 && (
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
              SEND
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainInterface;
