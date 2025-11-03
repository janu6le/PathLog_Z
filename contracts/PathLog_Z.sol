pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PathLog is ZamaEthereumConfig {
    struct LocationData {
        euint32 encryptedLatitude;
        euint32 encryptedLongitude;
        uint256 timestamp;
        uint32 decryptedLatitude;
        uint32 decryptedLongitude;
        bool isVerified;
    }

    struct UserSession {
        address userAddress;
        uint256 startTime;
        uint256 endTime;
        LocationData[] locations;
    }

    mapping(address => UserSession) public userSessions;
    mapping(address => bool) public hasActiveSession;

    event SessionStarted(address indexed user, uint256 startTime);
    event LocationAdded(address indexed user, uint256 timestamp);
    event SessionEnded(address indexed user, uint256 endTime);
    event DecryptionVerified(address indexed user, uint256 index);

    modifier onlyActiveSession() {
        require(hasActiveSession[msg.sender], "No active session");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function startSession() external {
        require(!hasActiveSession[msg.sender], "Session already active");

        userSessions[msg.sender] = UserSession({
            userAddress: msg.sender,
            startTime: block.timestamp,
            endTime: 0,
            locations: new LocationData[](0)
        });

        hasActiveSession[msg.sender] = true;

        emit SessionStarted(msg.sender, block.timestamp);
    }

    function addLocation(
        externalEuint32 encryptedLatitude,
        bytes calldata latitudeProof,
        externalEuint32 encryptedLongitude,
        bytes calldata longitudeProof
    ) external onlyActiveSession {
        require(
            FHE.isInitialized(FHE.fromExternal(encryptedLatitude, latitudeProof)) &&
            FHE.isInitialized(FHE.fromExternal(encryptedLongitude, longitudeProof)),
            "Invalid encrypted input"
        );

        euint32 lat = FHE.fromExternal(encryptedLatitude, latitudeProof);
        euint32 lon = FHE.fromExternal(encryptedLongitude, longitudeProof);

        FHE.allowThis(lat);
        FHE.allowThis(lon);

        FHE.makePubliclyDecryptable(lat);
        FHE.makePubliclyDecryptable(lon);

        userSessions[msg.sender].locations.push(LocationData({
            encryptedLatitude: lat,
            encryptedLongitude: lon,
            timestamp: block.timestamp,
            decryptedLatitude: 0,
            decryptedLongitude: 0,
            isVerified: false
        }));

        emit LocationAdded(msg.sender, block.timestamp);
    }

    function endSession() external onlyActiveSession {
        userSessions[msg.sender].endTime = block.timestamp;
        hasActiveSession[msg.sender] = false;

        emit SessionEnded(msg.sender, block.timestamp);
    }

    function verifyLocationDecryption(
        uint256 index,
        bytes memory latitudeAbiEncoded,
        bytes memory longitudeAbiEncoded,
        bytes memory decryptionProof
    ) external {
        require(userSessions[msg.sender].locations.length > index, "Invalid location index");
        require(!userSessions[msg.sender].locations[index].isVerified, "Location already verified");

        LocationData storage loc = userSessions[msg.sender].locations[index];

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(loc.encryptedLatitude);
        cts[1] = FHE.toBytes32(loc.encryptedLongitude);

        bytes memory combinedProof = abi.encodePacked(
            latitudeAbiEncoded,
            longitudeAbiEncoded
        );

        FHE.checkSignatures(cts, combinedProof, decryptionProof);

        uint32 decodedLat = abi.decode(latitudeAbiEncoded, (uint32));
        uint32 decodedLon = abi.decode(longitudeAbiEncoded, (uint32));

        loc.decryptedLatitude = decodedLat;
        loc.decryptedLongitude = decodedLon;
        loc.isVerified = true;

        emit DecryptionVerified(msg.sender, index);
    }

    function getEncryptedLocation(uint256 index) 
        external 
        view 
        returns (euint32 latitude, euint32 longitude) 
    {
        require(userSessions[msg.sender].locations.length > index, "Invalid location index");
        LocationData storage loc = userSessions[msg.sender].locations[index];
        return (loc.encryptedLatitude, loc.encryptedLongitude);
    }

    function getLocationCount() external view returns (uint256) {
        return userSessions[msg.sender].locations.length;
    }

    function getSessionInfo() external view returns (
        uint256 startTime,
        uint256 endTime,
        uint256 locationCount
    ) {
        UserSession storage session = userSessions[msg.sender];
        return (
            session.startTime,
            session.endTime,
            session.locations.length
        );
    }

    function getDecryptedLocation(uint256 index) 
        external 
        view 
        returns (uint32 latitude, uint32 longitude, bool verified) 
    {
        require(userSessions[msg.sender].locations.length > index, "Invalid location index");
        LocationData storage loc = userSessions[msg.sender].locations[index];
        return (loc.decryptedLatitude, loc.decryptedLongitude, loc.isVerified);
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


