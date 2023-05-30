import { Biconomy } from '@biconomy/mexa';
import { ethers } from 'ethers';
import { signTypedData, SignTypedDataVersion } from '@metamask/eth-sig-util';
import { toBuffer } from 'ethereumjs-util';

import nftFactoryManagerAbi from '../abis/nft-factory-manager.json'
import nftFactoryManagerAbiV2 from '../abis/nft-factory-manager-v2.json'
import collectionManagerAbi from '../abis/collection-manager.json'

function getBiconomy(provider, apiKey) {
  return new Promise((resolve, reject) => {
    const biconomy = new Biconomy(provider, {
      apiKey
    });
    biconomy
    .onEvent(biconomy.READY, () => resolve(biconomy))
    .onEvent(biconomy.ERROR, error => reject(error));
  });
}

export function getMaticProvider(maticRpcUrl: string): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider('https://polygon-rpc.com/', {
    name: 'Matic',
    chainId: 137
  });
}

export function validateAddress(address: string): string {
  return ethers.utils.getAddress(address);
}

export function getMetaWallet(): ethers.Wallet {
  return ethers.Wallet.createRandom();
}

export async function mintToken(
  maticProvider: ethers.providers.JsonRpcProvider,
  biconomyApiKey: string,
  nftFactoryManagerContract: string,
  managerGroupMemberSecret: string,
  appID: string,
  subscriberAddress: string,
  tokenID: string,
  tokenURI: string,
  tokenSignature: string,
  tokenRoyalty: number
): Promise<any> {
  // 1. Construct the function arguments using a managing group member's wallet.
  const managerWallet = new ethers.Wallet(managerGroupMemberSecret);
  const managerMessage = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "uint256", "string"],
    [subscriberAddress, tokenID, tokenRoyalty, tokenURI]
  );
  const managerMessageHash = ethers.utils.keccak256(managerMessage);
  const managerSignature = await managerWallet.signMessage(ethers.utils.arrayify(managerMessageHash));

  const contractInterface = new ethers.utils.Interface(nftFactoryManagerAbi);
  const functionSignature = contractInterface.encodeFunctionData('mintBatch', [
    [appID],
    [subscriberAddress],
    [tokenID],
    [tokenRoyalty],
    [tokenURI],
    ["\x19Ethereum Signed Message:\n"+tokenURI.length],
    [tokenSignature],
    [managerSignature]
  ]);

  // 2. Sign and execute the meta-transaction using a burner address
  const metaWallet = getMetaWallet();
  const sender = await metaWallet.getAddress();
  const biconomy: any = await getBiconomy(maticProvider, biconomyApiKey);
  const biconomyProvider = biconomy.getEthersProvider();
  const signedTx = await metaWallet.signTransaction({
    to: nftFactoryManagerContract,
    data: functionSignature,
    from: sender
  });
  const forwardData = await biconomy.getForwardRequestAndMessageToSign(signedTx);

  const signature = signTypedData({
    privateKey: toBuffer(metaWallet.privateKey),
    data: forwardData.eip712Format,
    version: SignTypedDataVersion.V3
  });
  const txnID = await biconomyProvider.send('eth_sendRawTransaction', [{
    signature,
    gasLimit: (Number(forwardData.request.txGas) + 100000).toString(),
    forwardRequest: forwardData.request,
    rawTransaction: signedTx,
    signatureType: biconomy.EIP712_SIGN
  }]);
  return txnID;
}

export async function getFactory(maticProvider: ethers.providers.JsonRpcProvider, nftFactoryManagerContract: string, appID: string): Promise<any> {
  // TODO: Initialize the contract only once?
  const nftFactoryManager = new ethers.Contract(nftFactoryManagerContract, nftFactoryManagerAbi, maticProvider);
  const address = await nftFactoryManager.getNFTFactory(appID);
  return address;
}

export async function mintTokenAndFactorySingleton(
  maticProvider: ethers.providers.JsonRpcProvider,
  biconomyApiKey: string,
  nftFactoryManagerContract: string,
  managerGroupMemberSecret: string,
  contractURI: string,
  creatorAddress: string,
  royaltyAddress: string,
  royaltyRate: number,
  tokenName: string,
  tokenSymbol: string,
  collectorAddress: string,
  tokenID: string,
  tokenURI: string,
  creatorSignature: string,
): Promise<string> {
  // 1. Construct the function arguments using a managing group member's wallet.
  const managerWallet = new ethers.Wallet(managerGroupMemberSecret);
  const managerMessage = ethers.utils.defaultAbiCoder.encode(
    [
      "string",
      "address",
      "address",
      "uint256",
      "string",
      "string",
      "address",
      "uint256",
      "string",
    ],
    [
      contractURI,
      creatorAddress,
      royaltyAddress,
      royaltyRate,
      tokenName,
      tokenSymbol,
      collectorAddress,
      tokenID,
      tokenURI,
    ]
  );
  const managerMessageHash = ethers.utils.keccak256(managerMessage);
  const managerSignature = await managerWallet.signMessage(ethers.utils.arrayify(managerMessageHash));

  const contractInterface = new ethers.utils.Interface(nftFactoryManagerAbiV2);
  const functionSignature = contractInterface.encodeFunctionData('mintBatch', [
    [contractURI],
    [creatorAddress],
    [royaltyAddress],
    [royaltyRate],
    [tokenName],
    [tokenSymbol],
    [collectorAddress],
    [tokenID],
    [tokenURI],
    [creatorSignature],
    [managerSignature],
  ]);

  // 2. Sign and execute the meta-transaction using a burner address
  const metaWallet = getMetaWallet();
  const sender = await metaWallet.getAddress();
  const biconomy: any = await getBiconomy(maticProvider, biconomyApiKey);
  const biconomyProvider = biconomy.getEthersProvider();
  const feeData = await biconomyProvider.getFeeData();
  const weiLimit = ethers.BigNumber.from(200).mul(ethers.BigNumber.from(1000000000));
  if (feeData.gasPrice.gt(weiLimit)) {
    throw new Error(`Fees too high (Actual: ${feeData.gasPrice.toString()}, Limit: ${weiLimit.toString()}`);
  }
  const signedTx = await metaWallet.signTransaction({
    to: nftFactoryManagerContract,
    data: functionSignature,
    from: sender
  });

  const forwardData = await biconomy.getForwardRequestAndMessageToSign(signedTx);
  const signature = signTypedData({
    privateKey: toBuffer(metaWallet.privateKey), 
    data: forwardData.eip712Format,
    version: SignTypedDataVersion.V3
  });
  const txnID = await biconomyProvider.send('eth_sendRawTransaction', [{
    signature,
    gasLimit: (Number(forwardData.request.txGas) + 500000).toString(),
    forwardRequest: forwardData.request,
    rawTransaction: signedTx,
    signatureType: biconomy.EIP712_SIGN
  }]);
  return txnID;
}

export async function getFactoryAddresses(
  maticProvider: ethers.providers.JsonRpcProvider,
  nftFactoryManagerContract: string,
  contractURIs: string[],
): Promise<any> {
  const nftFactoryManager = new ethers.Contract(nftFactoryManagerContract, nftFactoryManagerAbiV2, maticProvider);
  const addresses = await nftFactoryManager.getFactoryAddresses(contractURIs);
  return addresses;
}

export async function getExistsV2(
  maticProvider: ethers.providers.JsonRpcProvider,
  nftFactoryManagerContract: string,
  contractURIs: string[],
  tokenIDs: string[],
): Promise<any> {
  const nftFactoryManager = new ethers.Contract(nftFactoryManagerContract, nftFactoryManagerAbiV2, maticProvider);
  const exists = await nftFactoryManager.existsBatch(contractURIs, tokenIDs);
  return exists;
}

export async function mintTokenAndCollectionSingleton(
  maticProvider: ethers.providers.JsonRpcProvider,
  biconomyApiKey: string,
  collectionManagerContract: string, //!
  managerGroupMemberSecret: string,
  contractURI: string,
  contractOwner: string, //!
  contractRoyalty: number,
  contractName: string,
  contractSymbol: string,
  tokenURI: string,
  tokenSupplyCap: number,
  tokenID: string,
  tokenRecipient: string,
): Promise<string> {
  // 1. Construct the function arguments using a managing group member's wallet.
  const managerWallet = new ethers.Wallet(managerGroupMemberSecret);
  const contractMessage = ethers.utils.defaultAbiCoder.encode(
    [
      "string",
      "address",
      "uint256",
      "string",
      "string",
    ],
    [
      contractURI,
      contractOwner,
      contractRoyalty,
      contractName,
      contractSymbol,
    ]
  );

  const contractMsgHash = ethers.utils.keccak256(contractMessage);
  const contractSignature = await managerWallet.signMessage(ethers.utils.arrayify(contractMsgHash));

  const tokenMessage = ethers.utils.defaultAbiCoder.encode(
      [
          "string",
          "string",
          "uint64",
          "uint256[]",
          "address[]"
      ],
      [
          contractURI,
          tokenURI,
          tokenSupplyCap,
          [tokenID],
          [tokenRecipient],
      ]
  );

  const tokenMsgHash = ethers.utils.keccak256(tokenMessage);
  const tokenSignature = await managerWallet.signMessage(ethers.utils.arrayify(tokenMsgHash));

  const contractInterface = new ethers.utils.Interface(collectionManagerAbi);
  const functionSignature = contractInterface.encodeFunctionData('mintBatch', [
    contractURI,
    contractOwner,
    contractRoyalty,
    contractName,
    contractSymbol,
    contractSignature,
    tokenURI,
    tokenSupplyCap,
    [tokenID],
    [tokenRecipient],
    tokenSignature,
  ]);

  // 2. Sign and execute the meta-transaction using a burner address
  const metaWallet = getMetaWallet();
  const sender = await metaWallet.getAddress();
  const biconomy: any = await getBiconomy(maticProvider, biconomyApiKey);
  const biconomyProvider = biconomy.getEthersProvider();
  const feeData = await biconomyProvider.getFeeData();
  const weiLimit = ethers.BigNumber.from(200).mul(ethers.BigNumber.from(1000000000));
  if (feeData.gasPrice.gt(weiLimit)) {
    throw new Error(`Fees too high (Actual: ${feeData.gasPrice.toString()}, Limit: ${weiLimit.toString()}`);
  }
  const signedTx = await metaWallet.signTransaction({
    to: collectionManagerContract,
    data: functionSignature,
    from: sender
  });

  const forwardData = await biconomy.getForwardRequestAndMessageToSign(signedTx);
  const signature = signTypedData({
    privateKey: toBuffer(metaWallet.privateKey),
    data: forwardData.eip712Format,
    version: SignTypedDataVersion.V3
  });
  const txnID = await biconomyProvider.send('eth_sendRawTransaction', [{
    signature,
    gasLimit: (Number(forwardData.request.txGas) + 500000).toString(),
    forwardRequest: forwardData.request,
    rawTransaction: signedTx,
    signatureType: biconomy.EIP712_SIGN
  }]);
  return txnID;
}

export async function getCollectionAddresses(
  maticProvider: ethers.providers.JsonRpcProvider,
  collectionManagerContract: string,
  contractURIs: string[],
): Promise<any> {
  const managerContract = new ethers.Contract(collectionManagerContract, collectionManagerAbi, maticProvider);
  const addresses = await managerContract.getCollectionAddresses(contractURIs);
  return addresses;
}

export async function getExistsV3(
  maticProvider: ethers.providers.JsonRpcProvider,
  collectionManagerContract: string,
  contractURIs: string[],
  tokenIDs: string[],
): Promise<any> {
  const managerContract = new ethers.Contract(collectionManagerContract, collectionManagerAbi, maticProvider);
  const exists = await managerContract.existsBatch(contractURIs, tokenIDs);
  return exists;
}
