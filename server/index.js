const express = require('express');
const mysql = require('mysql');
const axios = require('axios');
const cors = require('cors'); // Import CORS middleware
const app = express();
require('dotenv').config();

// Enable CORS for all origins (adjust if necessary)
app.use(cors());

// Middleware to parse incoming JSON requests
app.use(express.json());

// Connect to your MySQL database
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

// Handle user queries
app.post('/api/query', async (req, res) => {
  const userQuery = req.body.query;

  // Define your schema here
  const datasetSchema = `
    You have access to the following tables:
    1. requests (rNum, locationId, equipmentType, currentStatus, completionDate, workCategory, priority, dateCreated, rfpStatus, requestAge, opsTime, corpTime, vendorBillingAmount, customerBillingAmount, nextActionDate, publicNoteDays, owner, employeeTeam, customerInvoiceSubtotal, customerInvoiceDate, customerInvoiceTax)
    2. customers (customerId, commonName)
    3. locations (locationId, city, state)

    Relationships:
    - requests.customerId is linked to customers.customerId
    - requests.locationId is linked to locations.locationId

    Please note that:
    - "customerInvoiceSubtotal" represents the total sales or revenue.
    - "customerInvoiceDate" represents the date when a job was billed and should be referenced for time-based sales queries, such as sales last year, sales by month, or general references to time and sales.
    - "rNum" represents jobs or work orders.
    - The state field uses state acronyms, e.g., "CA" stands for "California", "NY" stands for "New York", etc.
    - "equipmentType" represents trade.
    - The dataset should **always exclude** records where "requests.currentStatus = 'Closed: Duplicate'" or "requests.workCategory = 'Test'".
    - "(customerInvoiceSubtotal - vendorBillingAmount) / customerInvoiceSubtotal * 100" represents GPM
    - gpm needs to be calculated using jobs in "current status" = "closed: work order finished" and represented as a percentage

    Example SQL queries:
  1. **Get Monthly Work Orders**:
  SELECT 
    DATE_FORMAT(requests.dateCreated, '%b') AS Month,
    COUNT(requests.rNum) AS WorkOrders
  FROM requests
  WHERE requests.currentStatus != 'Closed: Duplicate' AND requests.workCategory != 'Test' 
    AND YEAR(requests.dateCreated) = YEAR(CURDATE())
  GROUP BY DATE_FORMAT(requests.dateCreated, '%b'), MONTH(requests.dateCreated)
ORDER BY MONTH(requests.dateCreated) ASC;

  2. **Total Revenue by State**:
  SELECT 
    locations.state,
    SUM(requests.customerInvoiceSubtotal) AS TotalRevenue
  FROM requests
  INNER JOIN locations ON requests.locationId = locations.locationId
  GROUP BY locations.state;

  3. **Top 5 Customers by Revenue**:
  SELECT 
    customers.commonName,
    SUM(requests.customerInvoiceSubtotal) AS TotalRevenue
  FROM requests
  INNER JOIN customers ON requests.customerId = customers.customerId
  GROUP BY customers.name
  ORDER BY TotalRevenue DESC
  LIMIT 5;

  4. **Average Job Duration for Each Equipment Type**:
  SELECT 
    requests.equipmentType,
    AVG(requests.opsTime + requestsCorpTime) AS AverageJobDuration
  FROM requests WHERE requests.currentStatus != 'Closed: Duplicate' AND requests.workCategory != 'Test' 
  AND requests.currentStatus LIKE "%Closed%" AND requests.equipmentType IS NOT NULL
  GROUP BY requests.equipmentType;

  5. **Sales by Month (Formatted as Currency)**:
  SELECT 
    DATE_FORMAT(customerInvoiceDate, '%b') AS Month,
    CONCAT('$',FORMAT(SUM(customerInvoiceSubtotal),2)) AS MonthlySales
FROM requests
WHERE YEAR(customerInvoiceDate) = YEAR(CURDATE())
GROUP BY DATE_FORMAT(customerInvoiceDate, '%b'), MONTH(customerInvoiceDate)
ORDER BY MONTH(customerInvoiceDate) ASC;
  `;

  try {
    console.log('Sending request to OpenAI...');

    // Send query to OpenAI API with dataset schema context
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `You are an assistant that generates SQL queries based on the following dataset: ${datasetSchema}` },
          { role: 'user', content: `Translate this query into a SQL query: "${userQuery}"` },
        ],
        max_tokens: 150,
      },
      {
        headers: { 
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let generatedSQL = data.choices[0].message.content.trim();

    // Remove any conversational text or markdown formatting
    const sqlMatch = generatedSQL.match(/```sql\s*([\s\S]*?)\s*```/i);
    if (sqlMatch && sqlMatch[1]) {
      generatedSQL = sqlMatch[1].trim();  // Extract only the SQL code
    } else {
      generatedSQL = generatedSQL.replace(/(Sure!|Here is the SQL query for "[^"]+":?)/i, '').trim();
    }

    console.log('Cleaned SQL:', generatedSQL);

    // Execute the SQL query in MySQL
    db.query(generatedSQL, (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ error: 'Database query error' });
      }

      // Log the results
      console.log('Query Results:', results);

      // Send both results and the generated SQL query back to the frontend
      res.json({ results, sqlQuery: generatedSQL });
    });

  } catch (error) {
    console.error('Error processing query:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error processing query' });
  }
});

// Start the server on port 5000
app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
