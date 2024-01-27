import express from "express";
import pool from "./db.js";
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import bodyParser from "body-parser";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from '@supabase/supabase-js'
import { google } from "googleapis";

const app = express();

const __dirname = dirname(fileURLToPath(import.meta.url));


app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json())

const supabaseUrl = 'https://fxfhlpqqvxwgcuisusdd.supabase.co'
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZmhscHFxdnh3Z2N1aXN1c2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTQxNTU2NjYsImV4cCI6MjAwOTczMTY2Nn0.EoEXVQBIHQOYAbangb9k-I7V_maDCHiO0k9feqT_MOY"
const supabase = createClient(supabaseUrl, supabaseKey)


// console.log(google);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });


// ### 以下係直接連接 railway 的 postgre database
app.post("/getdb", async (req, res) => {
  console.log(req.body)
  const { rows: posts } = await pool.query('SELECT * FROM alan;');
  console.log(posts)

  res.send({ posts });
});


// ### 以下係用 webhook 將 google sheet link send 去 n8n webhook，然後 n8n 會取得 gs 及加入 supabase 入面
// app.post("/submit-gslink", async(req, res) => {
//     console.log(req.body)
//     const webhookUrl = "https://api-soondoongyi.up.railway.app/webhook/d9778458-6c6b-471b-8c15-f14ea6f8535f";
//     const data = req.body
//     try {
//         const response = await axios.post(webhookUrl, data);
    
//         // Handle the response from the webhook if needed
//         console.log("Webhook response:", response.data);
//       } catch (error) {
//         console.error("Error sending webhook data:", error.message);
//       }
// });


// ### 以下係直接連接 google sheet
app.post("/submit-gslink", async(req, res) => {
    // Handle the click activity here
    console.log(req.body);
    
    const sheetLink = req.body.sheetLink.toString();
    console.log(process.env.GS_type)
    const auth = new google.auth.GoogleAuth({
        // keyFile: "credential.json",
        credentials: {
          "type": process.env.GS_type,
          "project_id": process.env.GS_project_id,
          "private_key_id":process.env.GS_private_key_id,
          "private_key":process.env.GS_private_key,
          "client_email":process.env.GS_client_email,
          "client_id":process.env.GS_client_id,
          "auth_uri":process.env.GS_auth_uri,
          "token_uri":process.env.GS_token_uri,
          "auth_provider_x509_cert_url":process.env.GS_auth_provider_x509_cert_url,
          "client_x509_cert_url":process.env.GS_client_x509_cert_url,
          "universe_domain":process.env.GS_universe_domain,
        },
        scopes: "https://www.googleapis.com/auth/spreadsheets"

    });

    
    // console.log(auth)

    const client = await auth.getClient()
    // console.log(client)

    const googleSheets = google.sheets({ version: "v4", auth: client });
    // console.log(googleSheets)

    // ### 抽取 google sheet id ###
    function extractSpreadsheetId(url) {
      const startIndex = url.indexOf("/d/") + 3; // Add 3 to skip "/d/"
      const endIndex = url.indexOf("/edit");
      
      if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        return url.substring(startIndex, endIndex);
      }
      return null; // Return null if the url format is not as expected
    }
    
    const spreadsheetId = extractSpreadsheetId(sheetLink)
    console.log(spreadsheetId);
    // const metaData = await googleSheets.spreadsheets.get({
    //     auth,
    //     spreadsheetId,
    // })

    // // console.log(metaData);
    
    // const sheetProperties = metaData.data.sheets[3].properties;
    // const sheetTitle = sheetProperties.title;
    
    // ### 以下會處理 completed raw 資料

    const sheetTitleFirst = "completed p1";

    const sheetDataFirst = await googleSheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetTitleFirst}!A1:Z5000`, // Adjust the range as per your needs
    });

    const valuesFirst = sheetDataFirst.data.values;
    console.log(valuesFirst);
    const columnTitlesFirst = valuesFirst[0];
    
    const formattedDataFirst = valuesFirst.slice(1).map((row) => {
      const rowData = {};
      row.forEach((value, index) => {
        const key = columnTitlesFirst[index]; // Use column title as the key
        rowData[key.trim()] = value.trim();
      });
      return rowData;
    });
    console.log(formattedDataFirst)

    try {
      let deleteTable = `
      DELETE FROM xero_raw;
      DELETE FROM completed_raw;`
      await pool.query(deleteTable);
      
      for (const row of formattedDataFirst) {
        const query = `
          INSERT INTO completed_raw (
            order_date, sub_order_number, sku_id, completion_date, quantity, total_cost, net_amount
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
        `;
        
        const valuesFirst = [
          row["Order Date"],
          row["Sub-Order Number"],
          row["SKU ID"],
          row["Completion Date"],
          row.Quantity,
          row["Total Cost"],
          row["Net Amount"]
        ];
        
        await pool.query(query, valuesFirst);
      }

      console.log("(completed_raw) Data inserted successfully");
    } catch (error) {
      console.error("(completed_raw) Error inserting data:", error.message);
    }

    // ### 以下會處理 xero raw 資料
    const sheetTitleSecond = "xero p1";

    const sheetDataSecond = await googleSheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: `${sheetTitleSecond}!A1:Z5000`, // Adjust the range as per your needs
    });

    const valuesSecond = sheetDataSecond.data.values;
    console.log(valuesSecond);
    const columnTitlesSecond = valuesSecond[0];
    
    const formattedDataSecond = valuesSecond.slice(1).map((row) => {
      const rowData = {};
      row.forEach((value, index) => {
        const key = columnTitlesSecond[index]; // Use column title as the key
        rowData[key.trim()] = value.trim();
      });
      return rowData;
    });
    console.log(formattedDataSecond)

    try {


      for (const row of formattedDataSecond) {
        const query = `
          INSERT INTO xero_raw (
            date_string, invoice_number, reference, total, item_code, quantity, unit_price, status, total_order_amount, total_order_qty
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
        `;
        
        const valuesSecond = [
          row.DateString,
          row.InvoiceNumber,
          row.Reference,
          row.Total,
          row["Item Code"],
          row.Quantity,
          row["unit price"],
          row.Status,
          row["total order amount"],
          row["total order qty"]
        ];
        
        await pool.query(query, valuesSecond);
      }

      console.log("(xero_raw) Data inserted successfully");
    } catch (error) {
      console.error("(xero_raw) Error inserting data:", error.message);
    }


//https://www.youtube.com/watch?v=PFJNJQCU_lo//
});


// ### 以下係直接連 supabase database
    // const { data, error } = await supabase.rpc('hello');
    // Send a response back to the frontend
    // console.log("Supabase response:", data);

    // const { data, error } = await supabase
    // .from('products')
    // .select('id, name, price');
    // console.log("Supabase response:", data);



app.listen(process.env.PORT, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});


