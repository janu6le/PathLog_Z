# PathLog_Z: Private Location History Tracker

PathLog_Z is a privacy-preserving application that allows users to record their location histories in an encrypted format, enabling the generation of lifestyle heat maps without revealing individual movements. Powered by Zama's Fully Homomorphic Encryption (FHE) technology, PathLog_Z epitomizes the future of secure data handling in our increasingly interconnected world.

## The Problem

In today's digital age, concerns regarding personal privacy and data security are paramount. Traditional location tracking services often store data in cleartext, making it vulnerable to unauthorized access and exploitation. Users risk their sensitive data being intercepted, sold, or misused, leading to potential breaches of privacy and personal safety. PathLog_Z addresses this critical gap by focusing on a robust solution that keeps user data confidential while still providing useful insights.

## The Zama FHE Solution

Zama's FHE technology revolutionizes how we handle sensitive information by enabling computation on encrypted data. By utilizing Zama's framework, PathLog_Z ensures that even when data is processed, it remains encrypted, safeguarding user privacy. This means that heat maps can be generated without ever exposing the users' actual trajectories. With Zama's infrastructure, users gain the ability to analyze their location data securely, retaining full control over their privacy.

Using the `fhevm` library allows for seamless data processing, enabling functionalities that take advantage of encrypted datasets without compromising security.

## Key Features

- 🔒 **Encrypted Location History**: All user location data is securely encrypted, ensuring that personal movements remain private.
- 🔥 **Homomorphic Heat Map Generation**: Generate lifestyle heat maps based on encrypted data without compromising on privacy.
- 👁️ **Personal Review Functionality**: Users can review their own data securely, gaining insights while keeping their information confidential.
- 🌍 **Data Sovereignty**: Users maintain control and ownership over their data, enhancing trust and security.

## Technical Architecture & Stack

PathLog_Z employs a robust technical architecture designed to prioritize user privacy and data security. The core stack includes:

- **Frontend**: React for a dynamic user interface.
- **Backend**: Node.js and Express for handling API requests.
- **Database**: MongoDB for encrypted storage of user data.
- **Privacy Engine**: Zama's FHE framework (specifically `fhevm`) for secure data processing.

## Smart Contract / Core Logic

The backend logic leverages Zama's FHE capabilities to manage encrypted data securely. Below is a simplified pseudo-code snippet demonstrating how to interact with encrypted location data using Zama's tools.solidity
// PathLog_Z.sol
pragma solidity ^0.8.0;

import "ZamaContract.sol";

contract PathLog_Z {
    struct EncryptedLocation {
        uint64 timestamp;
        bytes encryptedData;
    }

    EncryptedLocation[] public locationHistory;

    function addLocationData(uint64 timestamp, bytes memory encryptedData) public {
        locationHistory.push(EncryptedLocation(timestamp, encryptedData));
    }

    function generateHeatMap() public view returns (bytes) {
        return FHE.generateHeatMap(locationHistory); // Hypothetical function call
    }
}

## Directory Structure

The directory structure of PathLog_Z is organized for clarity and modularity:
PathLog_Z/
├── backend/
│   ├── server.js
│   ├── routes/
│   │   └── location.js
│   └── models/
│       └── locationModel.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── App.js
│   │   └── index.js
│   └── public/
│       └── index.html
└── contracts/
    └── PathLog_Z.sol

## Installation & Setup

To get started with PathLog_Z, ensure you have the following prerequisites:

- Node.js
- npm or pip
- A supported version of the Zama library

### Prerequisites

1. Install Node.js from the official website.
2. For backend dependencies, navigate to the backend directory and run:bash
   npm install

3. For the frontend, navigate to the frontend directory and run:bash
   npm install

4. Install the Zama library by executing:bash
   npm install fhevm

### Set Up the Database

PathLog_Z utilizes MongoDB for data storage. Ensure you have MongoDB installed and running. Configure the connection string in `backend/server.js`.

## Build & Run

To build and run PathLog_Z, execute the following commands:

1. Navigate to the backend directory and start the server:bash
   node server.js

2. In a new terminal, navigate to the frontend directory and start the React application:bash
   npm start

Now, open your browser and navigate to the local server to interact with PathLog_Z!

## Acknowledgements

This project owes its capabilities to Zama for providing the open-source FHE primitives that make this privacy-preserving venture possible. The powerful tools and libraries by Zama enable developers to build secure applications that prioritize user privacy and data integrity.

By leveraging Zama's technology, PathLog_Z not only addresses privacy concerns but also sets a new standard for handling sensitive information in application development.


