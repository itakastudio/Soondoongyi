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
  res.render('index.ejs');
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
app.post("/step1", async(req, res) => {
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
  
    try {
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
              order_date, sub_order_number, sku_id, completion_date, quantity, total_cost
              )
            VALUES (
              $1, $2, $3, $4, $5, $6
            )
          `;
          
          const valuesFirst = [
            row["Order Date"],
            row["Sub-Order Number"],
            row["SKU ID"],
            row["Completion Date"],
            row.Quantity,
            row["Total Cost"]
          ];
          
          await pool.query(query, valuesFirst);
        }
  
        console.log("(completed_raw) Data inserted successfully");
      } catch (error) {
        console.error("(completed_raw) Error inserting data:", error.message);
      }
    } catch(error) {
      res.render("index.ejs", { response: `${error.message}` });
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
            date_string, invoice_number, reference, total, item_code, quantity, unit_price
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
        `;
        
        const valuesSecond = [
          row.DateString,
          row.InvoiceNumber,
          row.Reference,
          row.Total,
          row["Item Code"],
          row.Quantity,
          row["unit price"]
        ];
        
        await pool.query(query, valuesSecond);
      }

      console.log("(xero_raw) Data inserted successfully");
      res.render("index.ejs", { response: "Step 1: Completed order and XERO order from report insert successfully" });
    } catch (error) {
      console.error("(xero_raw) Error inserting data:", error.message);
    }


//https://www.youtube.com/watch?v=PFJNJQCU_lo//
});

app.post("/step2", async(req, res) => {
  // ### 以下加入 completed_raw 處理資料
  console.log("handle completed")
  try {
    let dataProcess = `
    UPDATE completed_raw
    SET completed_total_order_amount = (
      SELECT SUM(total_cost)
      FROM completed_raw sub
      WHERE sub.sub_order_number = completed_raw.sub_order_number
    ), 
    completed_order_total_product_qty = (
      SELECT SUM(quantity)
      FROM completed_raw sub
      WHERE sub.sub_order_number = completed_raw.sub_order_number
    ), completed_combine_check = sub_order_number || '_' || sku_id || '_' || total_cost || '_' || quantity || '_' || completed_total_order_amount || '_' || completed_order_total_product_qty;
    `
    await pool.query(dataProcess);
  } catch (error) {
    console.error("(completed part)Error processing data:", error);
  }
  // ### 以下加入 xero_raw 處理資料
  console.log("handle xero")
  try {
    let dataProcess = `
    UPDATE xero_raw
    SET xero_total_order_amount = total, 
    xero_order_total_product_qty = (
      SELECT SUM(quantity)
      FROM xero_raw sub
      WHERE sub.reference = xero_raw.reference
      ), 
      xero_combine_check = reference || '_' || 'H6384001_S_' || item_code || '_' || (quantity * unit_price) || '_' || quantity || '_' || xero_total_order_amount || '_' || xero_order_total_product_qty;
    `;
    await pool.query(dataProcess);
  } catch (error) {
    console.error("(xero part)Error processing data:", error);
  }

  // ### 以下先將 matching_status 設定為 "not_matched"
  console.log("handle not_matched")
  try {
    let dataProcess = `
      UPDATE xero_raw
      SET matching_status = 'not_matched';
      `;
    await pool.query(dataProcess);
    res.render("index.ejs", { response: "Step 2: Data processing completed successfully." });
  } catch (error) {
    console.error("(not matched part)Error processing data:", error);
  }
  // ### 以下對比 completed_combine_check 及 xero_combine_check 
  console.log("handle matching")
  try {
    let dataProcess = `
      UPDATE xero_raw
      SET matching_status = 'all_matched'
      FROM completed_raw
      WHERE xero_raw.reference = completed_raw.sub_order_number
        AND CONCAT('H6384001_S_', xero_raw.item_code) = completed_raw.sku_id
        AND (xero_raw.quantity * xero_raw.unit_price) = completed_raw.total_cost
        AND xero_raw.quantity = completed_raw.quantity
        AND xero_raw.xero_total_order_amount = completed_raw.completed_total_order_amount
        AND xero_raw.xero_order_total_product_qty = completed_raw.completed_order_total_product_qty;
      `;
    await pool.query(dataProcess);
  } catch (error) {
    console.error("(matching part)Error processing data:", error);
  }

    // ### 以下 handle xero_raw sub_order_number 是否存在於 completed_raw
    console.log("handle not exist order")
    try {
      let dataProcess = `
        UPDATE xero_raw
        SET matching_status = 'order_not_exist'
        FROM completed_raw
        WHERE xero_raw.reference NOT IN (SELECT sub_order_number FROM completed_raw);
        `;
      await pool.query(dataProcess);
      res.render("index.ejs", { response: "Step 2: Data processing completed successfully." });
    } catch (error) {
      console.error("(not exist part)Error processing data:", error);
    }
});


// res.render("index.ejs", { response: "Step 2: Data processing completed successfully." });
// } catch (error) {
//   console.error("Error processing data:", error);
//   res.render("index.ejs", { response: "An error occurred while processing the data." });
// }
// });



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

