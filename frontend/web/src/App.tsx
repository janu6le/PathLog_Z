import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface LocationData {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  intensity?: number;
}

interface HeatmapStats {
  totalPoints: number;
  avgIntensity: number;
  verifiedPoints: number;
  recentActivity: number;
  hotspots: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newLocationData, setNewLocationData] = useState({ 
    name: "", 
    latitude: "", 
    longitude: "", 
    intensity: "" 
  });
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);
  const [stats, setStats] = useState<HeatmapStats>({
    totalPoints: 0,
    avgIntensity: 0,
    verifiedPoints: 0,
    recentActivity: 0,
    hotspots: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM for location tracking...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const locationsList: LocationData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          locationsList.push({
            id: parseInt(businessId.replace('location-', '')) || Date.now(),
            name: businessData.name,
            latitude: (businessData.publicValue1 / 1000000).toFixed(6),
            longitude: (businessData.publicValue2 / 1000000).toFixed(6),
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            intensity: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading location data:', e);
        }
      }
      
      setLocations(locationsList);
      calculateStats(locationsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load location data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const calculateStats = (locationList: LocationData[]) => {
    const totalPoints = locationList.length;
    const verifiedPoints = locationList.filter(loc => loc.isVerified).length;
    const recentActivity = locationList.filter(loc => 
      Date.now()/1000 - loc.timestamp < 60 * 60 * 24
    ).length;
    const avgIntensity = totalPoints > 0 ? 
      locationList.reduce((sum, loc) => sum + (loc.intensity || 0), 0) / totalPoints : 0;
    const hotspots = locationList.filter(loc => (loc.intensity || 0) > 7).length;

    setStats({
      totalPoints,
      avgIntensity: Math.round(avgIntensity * 10) / 10,
      verifiedPoints,
      recentActivity,
      hotspots
    });
  };

  const createLocation = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingLocation(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted location point..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const intensityValue = parseInt(newLocationData.intensity) || 1;
      const businessId = `location-${Date.now()}`;
      const latInt = Math.round(parseFloat(newLocationData.latitude) * 1000000);
      const lngInt = Math.round(parseFloat(newLocationData.longitude) * 1000000);
      
      const encryptedResult = await encrypt(contractAddress, address, intensityValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newLocationData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        latInt,
        lngInt,
        "Encrypted location point"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Location point created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewLocationData({ name: "", latitude: "", longitude: "", intensity: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingLocation(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Location intensity already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying location intensity on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Location intensity decrypted and verified!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Location data is already verified" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "FHE system is available and ready!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredLocations = locations.filter(location => {
    const matchesSearch = location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         location.latitude.includes(searchQuery) ||
                         location.longitude.includes(searchQuery);
    const matchesFilter = !filterVerified || location.isVerified;
    return matchesSearch && matchesFilter;
  });

  const renderStatsPanel = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <div className="stat-icon">📍</div>
          <div className="stat-content">
            <h3>Total Points</h3>
            <div className="stat-value">{stats.totalPoints}</div>
            <div className="stat-trend">+{stats.recentActivity} today</div>
          </div>
        </div>
        
        <div className="stat-card neon-blue">
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <h3>Verified Data</h3>
            <div className="stat-value">{stats.verifiedPoints}/{stats.totalPoints}</div>
            <div className="stat-trend">FHE Protected</div>
          </div>
        </div>
        
        <div className="stat-card neon-pink">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <h3>Avg Intensity</h3>
            <div className="stat-value">{stats.avgIntensity}/10</div>
            <div className="stat-trend">{stats.hotspots} hotspots</div>
          </div>
        </div>
        
        <div className="stat-card neon-green">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <h3>System Status</h3>
            <div className="stat-value">Active</div>
            <div className="stat-trend">FHE Ready</div>
          </div>
        </div>
      </div>
    );
  };

  const renderHeatmapChart = () => {
    const intensityLevels = [0, 0, 0, 0, 0];
    locations.forEach(loc => {
      const level = Math.min(4, Math.floor((loc.intensity || 0) / 2));
      intensityLevels[level]++;
    });

    return (
      <div className="heatmap-chart">
        <h3>Location Intensity Distribution</h3>
        <div className="intensity-bars">
          {intensityLevels.map((count, index) => (
            <div key={index} className="intensity-bar">
              <div 
                className="bar-fill"
                style={{ height: `${(count / Math.max(...intensityLevels)) * 100}%` }}
              ></div>
              <span className="bar-label">{count}</span>
              <span className="intensity-level">{index * 2}-{(index + 1) * 2}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProjectIntro = () => {
    return (
      <div className="project-intro">
        <h2>🔐 Private Location History</h2>
        <p>PathLog_Z - 個人軌跡隱私庫</p>
        <div className="intro-features">
          <div className="feature-item">
            <span className="feature-icon">🗺️</span>
            <span>軌跡加密存儲</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔥</span>
            <span>熱力圖同態生成</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">👤</span>
            <span>個人回顧</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔒</span>
            <span>數據主權</span>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>PathLog_Z 🔐</h1>
            <span>Private Location History</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🗺️🔐</div>
            <h2>Connect Your Wallet to Start Tracking</h2>
            <p>Protect your location history with fully homomorphic encryption. Your movements stay private while generating meaningful insights.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Add encrypted location points with intensity data</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Generate privacy-preserving heatmaps</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Location Encryption...</p>
        <p className="loading-note">Securing your location data with Zama FHE</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted location history...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>PathLog_Z 🔐</h1>
          <span>FHE-Powered Location Privacy</span>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="status-btn">
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn neon-glow"
          >
            + Add Location
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        {renderProjectIntro()}
        
        <div className="dashboard-section">
          {renderStatsPanel()}
          {renderHeatmapChart()}
        </div>

        <div className="search-filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>
          <div className="filter-options">
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={filterVerified}
                onChange={(e) => setFilterVerified(e.target.checked)}
              />
              <span className="checkmark"></span>
              Show Verified Only
            </label>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "🔄" : "↻"} Refresh
            </button>
          </div>
        </div>

        <div className="timeline-section">
          <h2>Location Timeline</h2>
          <div className="timeline-container">
            {filteredLocations.length === 0 ? (
              <div className="no-locations">
                <p>No location points found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Add Your First Location
                </button>
              </div>
            ) : (
              filteredLocations.map((location, index) => (
                <div 
                  className={`timeline-item ${location.isVerified ? "verified" : ""}`}
                  key={index}
                  onClick={() => setSelectedLocation(location)}
                >
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <div className="location-header">
                      <h3>{location.name}</h3>
                      <span className="location-time">
                        {new Date(location.timestamp * 1000).toLocaleString()}
                      </span>
                    </div>
                    <div className="location-coords">
                      <span>📍 {location.latitude}, {location.longitude}</span>
                      {location.isVerified && location.decryptedValue && (
                        <span className="intensity-badge">Intensity: {location.decryptedValue}/10</span>
                      )}
                    </div>
                    <div className="location-status">
                      {location.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateLocation 
          onSubmit={createLocation} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingLocation} 
          locationData={newLocationData} 
          setLocationData={setNewLocationData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedLocation && (
        <LocationDetailModal 
          location={selectedLocation} 
          onClose={() => setSelectedLocation(null)} 
          decryptData={() => decryptData(`location-${selectedLocation.id}`)}
          isDecrypting={fheIsDecrypting}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateLocation: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  locationData: any;
  setLocationData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, locationData, setLocationData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocationData({ ...locationData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-location-modal">
        <div className="modal-header">
          <h2>Add Encrypted Location Point</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Location Encryption</strong>
            <p>Activity intensity will be encrypted with Zama FHE 🔐</p>
          </div>
          
          <div className="form-group">
            <label>Location Name *</label>
            <input 
              type="text" 
              name="name" 
              value={locationData.name} 
              onChange={handleChange} 
              placeholder="Home, Work, Gym..." 
            />
          </div>
          
          <div className="coords-group">
            <div className="form-group">
              <label>Latitude *</label>
              <input 
                type="number" 
                step="any"
                name="latitude" 
                value={locationData.latitude} 
                onChange={handleChange} 
                placeholder="40.7128" 
              />
            </div>
            <div className="form-group">
              <label>Longitude *</label>
              <input 
                type="number" 
                step="any"
                name="longitude" 
                value={locationData.longitude} 
                onChange={handleChange} 
                placeholder="-74.0060" 
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Activity Intensity (1-10) *</label>
            <input 
              type="range" 
              min="1" 
              max="10" 
              name="intensity" 
              value={locationData.intensity} 
              onChange={handleChange} 
            />
            <div className="intensity-value">{locationData.intensity || 5}/10</div>
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !locationData.name || !locationData.latitude || !locationData.longitude} 
            className="submit-btn neon-glow"
          >
            {creating || isEncrypting ? "Encrypting Location..." : "Add Encrypted Point"}
          </button>
        </div>
      </div>
    </div>
  );
};

const LocationDetailModal: React.FC<{
  location: LocationData;
  onClose: () => void;
  decryptData: () => Promise<number | null>;
  isDecrypting: boolean;
}> = ({ location, onClose, decryptData, isDecrypting }) => {

  return (
    <div className="modal-overlay">
      <div className="location-detail-modal">
        <div className="modal-header">
          <h2>Location Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="location-info">
            <div className="info-item">
              <span>Location Name:</span>
              <strong>{location.name}</strong>
            </div>
            <div className="info-item">
              <span>Coordinates:</span>
              <strong>{location.latitude}, {location.longitude}</strong>
            </div>
            <div className="info-item">
              <span>Time Recorded:</span>
              <strong>{new Date(location.timestamp * 1000).toLocaleString()}</strong>
            </div>
          </div>
          
          <div className="encryption-section">
            <h3>FHE Encrypted Data</h3>
            
            <div className="data-row">
              <div className="data-label">Activity Intensity:</div>
              <div className="data-value">
                {location.isVerified ? 
                  `${location.decryptedValue}/10 (On-chain Verified)` : 
                  "🔒 FHE Encrypted Integer"
                }
              </div>
              <button 
                className={`decrypt-btn ${location.isVerified ? 'decrypted' : ''}`}
                onClick={decryptData} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Decrypting..." :
                 location.isVerified ? "✅ Verified" :
                 "🔓 Decrypt Intensity"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Privacy Protection</strong>
                <p>Your activity intensity is encrypted on-chain. Decryption happens offline with on-chain verification.</p>
              </div>
            </div>
          </div>
          
          {location.isVerified && (
            <div className="intensity-visualization">
              <h3>Activity Intensity</h3>
              <div className="intensity-meter">
                <div 
                  className="intensity-fill"
                  style={{ width: `${(location.decryptedValue || 0) * 10}%` }}
                ></div>
                <span className="intensity-text">{location.decryptedValue}/10</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!location.isVerified && (
            <button 
              onClick={decryptData} 
              disabled={isDecrypting}
              className="verify-btn neon-glow"
            >
              {isDecrypting ? "Decrypting..." : "Decrypt Intensity"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


