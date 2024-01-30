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

const step2 = express.Router();

step2.post("/", async (req, res) => {
  // ### 以下加入 completed_raw 處理資料
  console.log("handle completed");
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
      `;
    await pool.query(dataProcess);
    console.log("finished handle completed");
  } catch (error) {
    console.error("(completed part)Error processing data:", error);
  }
  // ### 以下加入 xero_raw 處理資料
  console.log("handle xero");
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
    console.log("finished handle xero");
  } catch (error) {
    console.error("(xero part)Error processing data:", error);
  }

  // ### 以下先將 matching_status 設定為 "not_matched"
  console.log("handle not_matched");
  try {
    let dataProcess = `
        UPDATE xero_raw
        SET matching_status = 'not_matched';
        `;
    await pool.query(dataProcess);
    console.log("finished handle not_matched");
  } catch (error) {
    console.error("(not matched part)Error processing data:", error);
  }
  // ### 以下對比 completed_combine_check 及 xero_combine_check
  console.log("handle matching");
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
    console.log("finished handle all_matched");
  } catch (error) {
    console.error("(matching part)Error processing data:", error);
  }

  // ### 以下 handle xero_raw sub_order_number 是否存在於 completed_raw
  console.log("handle not exist order");
  try {
    let dataProcess = `
        UPDATE xero_raw
        SET matching_status = 'order_not_exist'
        FROM completed_raw
        WHERE xero_raw.reference NOT IN (SELECT sub_order_number FROM completed_raw);
        `;
    await pool.query(dataProcess);
    console.log("finished handle order_not_exist");
  } catch (error) {
    console.error("(not exist part)Error processing data:", error);
  }

  // ### 以下 handle 兩張表內，一張訂單內的個別 sku 的數量、總價要一致
  console.log("handle product in the same order");
  try {
    let dataProcess = `
        UPDATE xero_raw AS x
        SET matching_status = 'product_matched'
        WHERE matching_status = 'not_matched'
        AND (
          SELECT CAST(SUM(quantity * unit_price) AS numeric(10,1))
          FROM xero_raw
          WHERE reference = x.reference
          AND item_code = x.item_code
        ) = (
          SELECT CAST(SUM(total_cost) AS numeric(10,1))
          FROM completed_raw
          WHERE sub_order_number = x.reference
          AND sku_id = CONCAT('H6384001_S_', x.item_code)
        )
        AND (
          SELECT SUM(quantity)
          FROM xero_raw
          WHERE reference = x.reference
          AND item_code = x.item_code
        ) = (
          SELECT SUM(quantity)
          FROM completed_raw
          WHERE sub_order_number = x.reference
          AND sku_id = CONCAT('H6384001_S_', x.item_code)
        );
        `;
    await pool.query(dataProcess);
    console.log("finished handle product in the same order");
  } catch (error) {
    console.error("(not exist part)Error processing data:", error);
  }

  // ### 以下 handle 兩張表內，整張訂單的所有 sku 的總數量、總價要一致
  console.log("handle the whole order");
  try {
    let dataProcess = `
          UPDATE xero_raw AS x
          SET matching_status = 'order_total_matched'
          WHERE matching_status = 'product_matched'
          AND (
            SELECT CAST(SUM(quantity * unit_price) AS numeric(10,1))
            FROM xero_raw
            WHERE reference = x.reference
          ) = (
            SELECT CAST(SUM(total_cost) AS numeric(10,1))
            FROM completed_raw
            WHERE sub_order_number = x.reference
          )
          AND (
            SELECT SUM(quantity)
            FROM xero_raw
            WHERE reference = x.reference
          ) = (
            SELECT SUM(quantity)
            FROM completed_raw
            WHERE sub_order_number = x.reference
          );
          `;
    await pool.query(dataProcess);
    console.log("finished handle the whole order");
    res.render("index.ejs", {
      response: "Step 2: Data processing completed successfully.",
    });
  } catch (error) {
    console.error("(not exist part)Error processing data:", error);
  }
});

export { step2 };
