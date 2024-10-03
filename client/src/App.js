import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line, Bar, Pie, Radar, PolarArea, Doughnut } from 'react-chartjs-2';
import { useTable } from 'react-table';
import './App.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

const interpolateColor = (color1, color2, factor) => {
  const result = color1.slice();
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - result[i]));
  }
  return `rgb(${result[0]}, ${result[1]}, ${result[2]})`;
};

const hexToRgb = (hex) => {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

function App() {
  const [query, setQuery] = useState('');
  const [chartData, setChartData] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('line');

  const baseColor = '#79bc43';
  const lighterColor = '#dff2d1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/api/query', { query });
      const result = response.data.results;

      if (!result || result.length === 0) {
        setError('No data returned from the query.');
        setChartData(null);
        setTableData([]);
        return;
      }

      const keys = Object.keys(result[0]);
      const tableColumns = keys.map((key) => ({ Header: key, accessor: key }));
      setColumns(tableColumns);
      setTableData(result);

      const values = result.map((item) => {
        const value = item[keys[1]];
        return typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, "")) : value;
      });

      const maxValue = Math.max(...values);

      const data = {
        labels: result.map((item) => item[keys[0]]),
        datasets: [
          {
            label: `Dataset for ${keys[1]}`,
            data: values,
            backgroundColor: values.map((value) => {
              const intensity = value / maxValue;
              return interpolateColor(hexToRgb(baseColor), hexToRgb(lighterColor), intensity);
            }),
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            fill: true,
          },
        ],
      };
      setChartData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setChartData(null);
      setTableData([]);
    }
  };

  // Function to check if data should be treated as currency
  const isCurrencyData = (key) => {
    return key.toLowerCase().includes('subtotal') || key.toLowerCase().includes('amount');
  };

  // Dynamically format the axis based on the data type
  const getDynamicYAxisOptions = (key) => {
    if (isCurrencyData(key)) {
      return {
        ticks: {
          callback: (value) => `$${value.toLocaleString()}`, // Format as currency
        },
      };
    }
    return {
      ticks: {
        callback: (value) => value.toLocaleString(), // Generic number format
      },
    };
  };

  const renderChart = () => {
    if (!chartData) return null;

    const chartOptions = {
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              const value = context.raw;
              return isCurrencyData(chartData.datasets[0].label)
                ? `$${value.toLocaleString()}`
                : value.toLocaleString();
            },
          },
        },
      },
      scales: {
        y: getDynamicYAxisOptions(chartData.datasets[0].label),
      },
    };

    switch (chartType) {
      case 'bar':
        return <Bar data={chartData} options={chartOptions} />;
      case 'pie':
        return <Pie data={chartData} options={chartOptions} />;
      case 'doughnut':
        return <Doughnut data={chartData} options={chartOptions} />;
      case 'radar':
        return <Radar data={chartData} options={chartOptions} />;
      case 'polarArea':
        return <PolarArea data={chartData} options={chartOptions} />;
      default:
        return <Line data={chartData} options={chartOptions} />;
    }
  };

  const Table = ({ columns, data }) => {
    const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = useTable({ columns, data });

    return (
      <table {...getTableProps()} className="table-responsive">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id}>
              {headerGroup.headers.map((column) => (
                <th {...column.getHeaderProps()} key={column.id}>
                  {column.render('Header')}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          {rows.map((row) => {
            prepareRow(row);
            return (
              <tr {...row.getRowProps()} key={row.id}>
                {row.cells.map((cell) => (
                  <td {...cell.getCellProps()} key={cell.value}>
                    {cell.render('Cell')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="app-container">
      <h1>Ask a Question</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about the dataset"
          style={{ width: '500px' }}
        />
        <button type="submit">Submit</button>
      </form>

      <div className="chart-options">
        <label htmlFor="chartType">Choose a chart type: </label>
        <select id="chartType" value={chartType} onChange={(e) => setChartType(e.target.value)}>
          <option value="line">Line Chart</option>
          <option value="bar">Bar Chart</option>
          <option value="doughnut">Doughnut Chart</option>
          <option value="radar">Radar Chart</option>
          <option value="polarArea">Polar Area Chart</option>
        </select>
      </div>

      {chartData && (
        <div className="chart-container">
          <h2>Chart</h2>
          {renderChart()}
        </div>
      )}

      {tableData.length > 0 && columns.length > 0 && (
        <div className="table-container">
          <h2>Data Table</h2>
          <Table columns={columns} data={tableData} />
        </div>
      )}

      {error && (
        <div className="error">
          <h2>Error:</h2>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
