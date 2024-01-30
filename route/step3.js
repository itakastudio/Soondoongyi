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

const step3 = express.Router();

// ### 以下將 database 內 matching result 加回 google sheet
step3.post("/", async (req, res) => {
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

  const googleSheetRange = "xero p1!C:C"; // Specify the range that includes column A and column B in the Google Sheet

  const dbQuery = "SELECT reference, matching_status FROM xero_raw"; // Replace with your actual table name and column names

  try {
    // Retrieve values from column A and column B in the Google Sheet
    const response = await googleSheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: googleSheetRange,
    });

    console.log(response.data.values);

    const googleSheetValues = response.data.values;

    // Retrieve values from column C and column D in the database
    const dbResult = await pool.query(dbQuery);
    const dbValues = dbResult.rows;
    const updates = [];

    console.log(dbValues);

    for (let i = 1; i < googleSheetValues.length; i++) {
      const googleSheetValueA = googleSheetValues[i][0].trim();

      const matchingValue = dbValues.find((dbValue) => {
        const dbValueReference = dbValue.reference.trim();
        console.log("dbValue:", dbValue);
        console.log("dbValue.reference:", dbValueReference);
        return dbValueReference === googleSheetValueA;
      });

      // for (let i = 0; i < googleSheetValues.length; i++) {
      //   const googleSheetValueA = googleSheetValues[i][0].trim();
      //   console.log('googleSheetValueA:', googleSheetValueA);

      //   const matchingValue = dbValues.find((dbValue) => {
      //     const dbValueReference = dbValue.reference.trim();
      //     console.log('dbValue:', dbValue);
      //     console.log('dbValue.reference:', dbValueReference);
      //     console.log('comparison:', dbValueReference === googleSheetValueA);
      //     console.log('trimmed comparison:', dbValueReference.localeCompare(googleSheetValueA, 'en', { sensitivity: 'base' }) === 0);
      //     return dbValueReference === googleSheetValueA;
      //   });

      // for (let i = 0; i < googleSheetValues.length; i++) {
      //   const googleSheetValueA = googleSheetValues[i][0].trim();
      //   console.log('googleSheetValueA:', googleSheetValueA);

      //   const matchingValue = dbValues.find((dbValue) => {
      //     const dbValueReference = dbValue.reference.trim();
      //     console.log('dbValue:', dbValue);
      //     console.log('dbValue.reference:', dbValueReference);

      //     // Compare the trimmed values character by character
      //     let isMatch = true;
      //     for (let j = 0; j < dbValueReference.length; j++) {
      //       if (dbValueReference[j] !== googleSheetValueA[j]) {
      //         console.log(`Mismatch at index ${j}: '${dbValueReference[j]}' vs '${googleSheetValueA[j]}'`);
      //         isMatch = false;
      //         break;
      //       }
      //     }

      //     return isMatch;
      //   });
      // }
      if (matchingValue) {
        const sheetName = "xero p1";
        const columnLetter = "H";
        const rowIndex = i + 1;

        const googleSheetRangeB = `${sheetName}!${columnLetter}:${columnLetter}${rowIndex}`;

        const dbValueD = matchingValue.matching_status;

        // Prepare the update object
        const update = {
          range: googleSheetRangeB,
          values: [[dbValueD]],
        };
        console.log(updates);
        updates.push(update);
      }
    }

    console.log(updates);

    if (updates.length > 0) {
      const batchUpdateRequest = {
        spreadsheetId,
        resource: {
          valueInputOption: "RAW",
          data: updates.map((update) => ({
            range: update.range,
            values: update.values,
          })),
        },
      };

      const batchUpdateResponse =
        await googleSheets.spreadsheets.values.batchUpdate(batchUpdateRequest);

      console.log("Data updated successfully:", batchUpdateResponse.data);
    } else {
      console.log("No updates to perform.");
    }

    res.render("index.ejs", {
        response: "Step 3: Data tranfer to google sheet successfully.",
      });
  } catch (error) {
    console.error("Error updating data:", error);
  }
});

export { step3 };
