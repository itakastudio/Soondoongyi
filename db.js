import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
});
export default pool;


// ### connect and login to postgre database
// psql -U postgres -p 31227 -h monorail.proxy.rlwy.net railway


// ### export database, -c mean creat database statement.
// pg_dump -U postgres -p 31227 -h monorail.proxy.rlwy.net -C  railway > railway_test.sql


// ### Import database to postgre
// psql -U postgres -p 31227 -h monorail.proxy.rlwy.net  < railway_test.sql   

// ### https://www.netguru.com/blog/how-to-dump-and-restore-postgresql-database