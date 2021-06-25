/* eslint-disable import/no-webpack-loader-syntax */
import React from "react";
import logo from "./logo.svg";
import "./App.css";

//const addon = require('./native.node');
import addon from "./native.node";

function App() {
  console.log("Addon is:");
  console.log(addon);

  return (
    <div className="App">
      <header className="App-header">
        <p>Built using CRA electron-builder-typescript Template.</p>
        <p>{addon.litelib_say_hello("Me")}</p>
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>public/electron.js</code> or <code>src/App.js</code> and save to reload.
        </p>
        d
      </header>
    </div>
  );
}

export default App;
