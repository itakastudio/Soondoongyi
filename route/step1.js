import express from "express";
import pool from "../db.js";
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import bodyParser from "body-parser";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const step1 = express.Router()


step1.post("/", async (req, res) => {
    // Handle the click activity here
    console.log(req.body);
    const sheetLink = req.body.sheetLink.toString();
    console.log(process.env.GS_type);
    const auth = new google.auth.GoogleAuth({
      // keyFile: "credential.json",
      credentials: {
        type: process.env.GS_type,
        project_id: process.env.GS_project_id,
        private_key_id: process.env.GS_private_key_id,
        private_key: process.env.GS_private_key,
        client_email: process.env.GS_client_email,
        client_id: process.env.GS_client_id,
        auth_uri: process.env.GS_auth_uri,
        token_uri: process.env.GS_token_uri,
        auth_provider_x509_cert_url: process.env.GS_auth_provider_x509_cert_url,
        client_x509_cert_url: process.env.GS_client_x509_cert_url,
        universe_domain: process.env.GS_universe_domain,
      },
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });
  
    // console.log(auth)
  
    const client = await auth.getClient();
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
  
    const spreadsheetId = extractSpreadsheetId(sheetLink);
    console.log(spreadsheetId);
  
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
      console.log(formattedDataFirst);
      try {
        let deleteTable = `
          DELETE FROM xero_raw;
          DELETE FROM completed_raw;`;
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
            row["Total Cost"],
          ];
  
          await pool.query(query, valuesFirst);
        }
  
        console.log("(completed_raw) Data inserted successfully");
      } catch (error) {
        console.error("(completed_raw) Error inserting data:", error.message);
      }
    } catch (error) {
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
    console.log(formattedDataSecond);
  
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
      res.render("index.ejs", {
        response:
          "Step 1: Completed order and XERO order from report insert successfully",
      });
    } catch (error) {
      console.error("(xero_raw) Error inserting data:", error.message);
    }
  
    //https://www.youtube.com/watch?v=PFJNJQCU_lo//
  });

  export {step1};
 