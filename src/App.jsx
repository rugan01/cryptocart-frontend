import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import CryptocartABI from './contracts/Cryptocart.json';
import './App.css';

// 🚨 PASTE YOUR DEPLOYED CONTRACT ADDRESS HERE 🚨
const CONTRACT_ADDRESS = "0xBD040aA541E0118409558E5825fb2161D6AAc24c";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("");

  // New State for the Add Product Form
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();

        const cryptocartContract = new ethers.Contract(CONTRACT_ADDRESS, CryptocartABI.abi, signer);

        setAccount(accounts[0]);
        setContract(cryptocartContract);
        setStatus("Wallet connected! Fetching store inventory...");
      } catch (error) {
        console.error("Connection failed:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const fetchAllProducts = async () => {
    if (contract) {
      try {
        const totalProducts = await contract.productCount();
        const loadedProducts = [];

        for (let i = 1; i <= totalProducts; i++) {
          const productData = await contract.products(i);
          loadedProducts.push({
            id: i,
            name: productData.name,
            price: ethers.formatEther(productData.price),
            isDelivered: productData.isDelivered
          });
        }
        setProducts(loadedProducts);
        setStatus("");
      } catch (error) {
        console.error("Failed to fetch products:", error);
      }
    }
  };

  useEffect(() => {
    fetchAllProducts();
  }, [contract]);

  // --- NEW: Add Product Function (For the Seller) ---
  const addProduct = async (e) => {
    e.preventDefault(); // Prevents the page from refreshing when you submit the form
    if (contract && newName && newPrice) {
      try {
        setStatus("Waiting for MetaMask to approve adding product...");
        const priceInWei = ethers.parseEther(newPrice);

        const tx = await contract.addProduct(newName, priceInWei);

        setStatus("Transaction sent! Adding product to the blockchain...");
        await tx.wait();

        setStatus(`🎉 Success! "${newName}" added to the store.`);
        setNewName("");
        setNewPrice("");

        // Refresh the product list automatically!
        fetchAllProducts();
      } catch (error) {
        console.error("Add product failed:", error);
        setStatus("Failed to add product. Check console.");
      }
    }
  };

  const buyProduct = async (id, priceString) => {
    if (contract) {
      try {
        setStatus(`Waiting for MetaMask to approve purchase of Product #${id}...`);
        const priceInWei = ethers.parseEther(priceString);

        const tx = await contract.buyProduct(id, { value: priceInWei });

        setStatus("Transaction sent! Locking funds in escrow...");
        await tx.wait();

        setStatus(`🎉 Success! Product #${id} is now locked in escrow.`);
        fetchAllProducts();
      } catch (error) {
        console.error("Purchase failed:", error);
        setStatus("Purchase failed. Make sure you aren't the seller!");
      }
    }
  };

  // --- NEW: Confirm Delivery Function (For the Buyer) ---
  const confirmDelivery = async (id) => {
    if (contract) {
      try {
        setStatus(`Waiting for MetaMask to confirm delivery of Product #${id}...`);

        const tx = await contract.confirmDelivery(id);

        setStatus("Transaction sent! Releasing funds to the seller...");
        await tx.wait();

        setStatus(`💸 Success! Escrow unlocked. Funds transferred to seller.`);
        fetchAllProducts();
      } catch (error) {
        console.error("Confirmation failed:", error);
        setStatus("Confirmation failed. Are you sure you are the buyer?");
      }
    }
  };

  return (
    <div className="App">
      <h1>🛒 Cryptocart Escrow</h1>

      {!account ? (
        <button onClick={connectWallet} className="connect-btn">
          🦊 Connect MetaMask
        </button>
      ) : (
        <div className="dashboard">
          <p className="wallet-text">Connected: <code>{account.slice(0, 6)}...{account.slice(-4)}</code></p>

          {status && <p className="status-message">{status}</p>}

          {/* --- NEW: Add Product Form --- */}
          <div className="add-product-section">
            <h3>Sell an Item</h3>
            <form onSubmit={addProduct} className="add-form">
              <input
                type="text"
                placeholder="Product Name (e.g. Ledger Nano)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Price in ETH (e.g. 0.05)"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
              <button type="submit" className="add-btn">Add to Blockchain</button>
            </form>
          </div>

          <hr />

          <div className="store-grid">
            {products.map((item) => (
              <div key={item.id} className="product-card">
                <h2>{item.name}</h2>
                <p>ID: #{item.id}</p>
                <p>Price: <strong>{item.price} ETH</strong></p>
                <p>Status: {item.isDelivered ? "✅ Delivered" : "📦 Pending / Escrow"}</p>

                {/* We show BOTH buttons if it's not delivered. 
                    The Smart Contract will reject anyone who clicks the wrong button! */}
                {!item.isDelivered && (
                  <div className="button-group">
                    <button onClick={() => buyProduct(item.id, item.price)} className="buy-btn">
                      Buy
                    </button>
                    <button onClick={() => confirmDelivery(item.id)} className="confirm-btn">
                      Confirm Delivery
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}

export default App;