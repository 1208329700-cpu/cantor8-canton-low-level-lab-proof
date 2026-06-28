import crypto from "node:crypto";
import fs from "node:fs/promises";

const AUTH_BASE = process.env.CANTON_AUTH_BASE ?? "https://auth.dev.digik.cantor8.tech";
const VALIDATOR_BASE =
  process.env.CANTON_VALIDATOR_BASE ?? "https://api.validator.dev.digik.cantor8.tech/api/validator";
const LEDGER_BASE = process.env.CANTON_LEDGER_BASE ?? "https://api.validator.dev.digik.cantor8.tech/api/ledger";
const CLIENT_ID = process.env.CANTON_CLIENT_ID ?? "hackathon";
const CLIENT_SECRET = process.env.CANTON_CLIENT_SECRET;

function requireEnv(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Keep plain text body.
    }
  }
  if (!response.ok) {
    const prettyBody = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    throw new Error(`${options.method ?? "GET"} ${url} failed: ${response.status} ${response.statusText}\n${prettyBody}`);
  }
  return body;
}

async function postJson(url, accessToken, body) {
  return request(url, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

async function token() {
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: requireEnv(CLIENT_SECRET, "CANTON_CLIENT_SECRET"),
  });
  const body = await request(`${AUTH_BASE}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return body.access_token;
}

function authHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

function generateEd25519() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return {
    publicKey,
    privateKey,
    publicKeyHex: publicDer.subarray(-32).toString("hex"),
    privateKeyPkcs8Pem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeySpkiPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}

function loadPrivateKey(pem) {
  return crypto.createPrivateKey(pem);
}

function signHashHex(privateKey, hashHex) {
  return crypto.sign(null, Buffer.from(hashHex, "hex"), privateKey).toString("hex");
}

function signPreparedHash(privateKey, hash) {
  const bytes = /^[0-9a-fA-F]+$/.test(hash) && hash.length % 2 === 0
    ? Buffer.from(hash, "hex")
    : Buffer.from(hash, "base64");
  return crypto.sign(null, bytes, privateKey);
}

function partyFingerprint(partyId) {
  const parts = partyId.split("::");
  return parts.at(-1);
}

function toDisclosedContract(contractWithState) {
  const contract = contractWithState.contract ?? contractWithState;
  return {
    templateId: contract.template_id ?? contract.templateId,
    contractId: contract.contract_id ?? contract.contractId,
    createdEventBlob: contract.created_event_blob ?? contract.createdEventBlob,
    synchronizerId: contractWithState.domain_id ?? contractWithState.synchronizerId,
  };
}

function eventToDisclosedContract(createdEvent, synchronizerId) {
  return {
    templateId: createdEvent.templateId,
    contractId: createdEvent.contractId,
    createdEventBlob: createdEvent.createdEventBlob,
    synchronizerId,
  };
}

function makeWildcardEventFormat(parties) {
  const filtersByParty = Object.fromEntries(parties.map((party) => [
    party,
    {
      cumulative: [
        {
          identifierFilter: {
            WildcardFilter: {
              value: {
                includeCreatedEventBlob: true,
              },
            },
          },
        },
      ],
    },
  ]));
  return {
    filtersByParty,
    verbose: true,
  };
}

function makeTemplateEventFormat(parties, templateId) {
  const filtersByParty = Object.fromEntries(parties.map((party) => [
    party,
    {
      cumulative: [
        {
          identifierFilter: {
            TemplateFilter: {
              value: {
                templateId,
                includeCreatedEventBlob: true,
              },
            },
          },
        },
      ],
    },
  ]));
  return { filtersByParty, verbose: true };
}

function makeInterfaceEventFormat(parties, interfaceId) {
  const filtersByParty = Object.fromEntries(parties.map((party) => [
    party,
    {
      cumulative: [
        {
          identifierFilter: {
            InterfaceFilter: {
              value: {
                interfaceId,
                includeInterfaceView: true,
                includeCreatedEventBlob: true,
              },
            },
          },
        },
      ],
    },
  ]));
  return { filtersByParty, verbose: true };
}

function unwrapCreatedEvents(transaction) {
  return (transaction.events ?? [])
    .map((event) => event.CreatedEvent ?? event.createdEvent ?? event)
    .filter((event) => event.contractId && event.templateId);
}

function unwrapActiveContracts(responses) {
  return responses
    .map((entry) => entry.contractEntry?.JsActiveContract ?? entry.contractEntry?.ActiveContract ?? entry.contractEntry?.JsActiveContract?.value)
    .filter(Boolean)
    .map((active) => active.createdEvent ? active : active.value ?? active);
}

function findCreatedEventByTemplate(transaction, templateIdSuffix) {
  return unwrapCreatedEvents(transaction).find((event) => event.templateId.endsWith(templateIdSuffix));
}

function createdPayload(event) {
  return event.createArgument ?? event.createArguments ?? {};
}

function deduplicationDuration(seconds = 30) {
  return {
    DeduplicationDuration: {
      value: {
        seconds,
        nanos: 0,
      },
    },
  };
}

function pickOpenMiningRound(rounds) {
  const now = Date.now();
  const open = rounds
    .map((round) => ({
      round,
      opensAt: Date.parse(round.contract.payload.opensAt),
      targetClosesAt: Date.parse(round.contract.payload.targetClosesAt),
    }))
    .filter(({ opensAt, targetClosesAt }) => opensAt <= now && now < targetClosesAt)
    .sort((a, b) => b.opensAt - a.opensAt);
  if (open.length > 0) {
    return open[0].round;
  }
  return rounds
    .map((round) => ({ round, opensAt: Date.parse(round.contract.payload.opensAt) }))
    .sort((a, b) => b.opensAt - a.opensAt)[0]?.round;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function createExternalParty({ partyHint, accessToken, keyInfo }) {
  const generated = await request(`${VALIDATOR_BASE}/v0/admin/external-party/topology/generate`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      party_hint: partyHint,
      public_key: keyInfo.publicKeyHex,
    }),
  });

  const signed_topology_txs = generated.topology_txs.map((tx) => ({
    topology_tx: tx.topology_tx,
    signed_hash: signHashHex(keyInfo.privateKey, tx.hash),
  }));

  const submitted = await request(`${VALIDATOR_BASE}/v0/admin/external-party/topology/submit`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      public_key: keyInfo.publicKeyHex,
      signed_topology_txs,
    }),
  });

  return { generated, submitted };
}

async function ledgerGet(path, accessToken) {
  return request(`${LEDGER_BASE}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
}

async function validatorGet(path, accessToken) {
  return request(`${VALIDATOR_BASE}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
}

async function getNetworkContext(accessToken) {
  const [validatorUser, amuletRulesBody, roundsBody] = await Promise.all([
    validatorGet("/v0/validator-user", accessToken),
    validatorGet("/v0/scan-proxy/amulet-rules", accessToken),
    validatorGet("/v0/scan-proxy/open-and-issuing-mining-rounds", accessToken),
  ]);
  const openMiningRound = pickOpenMiningRound(roundsBody.open_mining_rounds);
  if (!openMiningRound) {
    throw new Error("No open mining round returned by scan-proxy");
  }
  return {
    validatorParty: validatorUser.party_id,
    validatorUser,
    amuletRules: amuletRulesBody.amulet_rules,
    openMiningRound,
    dsoParty: amuletRulesBody.amulet_rules.contract.payload.dso,
  };
}

async function createSetupProposal({ accessToken, partyId }) {
  const context = await getNetworkContext(accessToken);
  const createdAt = new Date();
  const expiresAt = addDays(createdAt, 89);
  const amuletRulesContractId = context.amuletRules.contract.contract_id;
  const openMiningRoundContractId = context.openMiningRound.contract.contract_id;
  const amuletRulesTemplateId = context.amuletRules.contract.template_id;
  const amuletPackageId = amuletRulesTemplateId.split(":")[0];
  const amuletTemplateId = "#splice-amulet:Splice.Amulet:Amulet";
  const validatorAmulets = await queryAcs({
    accessToken,
    partyId: context.validatorParty,
    eventFormat: makeTemplateEventFormat([context.validatorParty], amuletTemplateId),
  });
  const feeInputEvents = validatorAmulets.activeContracts
    .map((active) => ({ active, amount: decimalValue(createdPayload(active.createdEvent).amount?.initialAmount) }))
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
  const feeInputs = feeInputEvents.map(({ active }) => ({
    tag: "InputAmulet",
    value: active.createdEvent.contractId,
  }));

  const commandId = `codex-preapproval-proposal-${crypto.randomUUID()}`;
  const command = {
    ExerciseCommand: {
      templateId: amuletRulesTemplateId,
      contractId: amuletRulesContractId,
      choice: "AmuletRules_CreateExternalPartySetupProposal",
      choiceArgument: {
        context: {
          amuletRules: amuletRulesContractId,
          context: {
            openMiningRound: openMiningRoundContractId,
            issuingMiningRounds: [],
            validatorRights: [],
            featuredAppRight: null,
          },
        },
        inputs: feeInputs,
        user: partyId,
        validator: context.validatorParty,
        preapprovalExpiresAt: expiresAt.toISOString(),
        expectedDso: context.dsoParty,
      },
    },
  };

  const body = {
    commands: {
      commandId,
      commands: [command],
      actAs: [context.validatorParty],
      readAs: [partyId],
      disclosedContracts: [
        toDisclosedContract(context.amuletRules),
        toDisclosedContract(context.openMiningRound),
        ...feeInputEvents.map(({ active }) => eventToDisclosedContract(
          active.createdEvent,
          active.synchronizerId,
        )),
      ],
      synchronizerId: toDisclosedContract(context.amuletRules).synchronizerId,
      packageIdSelectionPreference: [amuletPackageId],
    },
    transactionFormat: {
      eventFormat: makeWildcardEventFormat([context.validatorParty, partyId]),
      transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
    },
  };

  const response = await postJson(`${LEDGER_BASE}/v2/commands/submit-and-wait-for-transaction`, accessToken, body);
  const proposalEvent = findCreatedEventByTemplate(
    response.transaction,
    ":Splice.AmuletRules:ExternalPartySetupProposal",
  );
  if (!proposalEvent) {
    throw new Error(`Proposal create event not found in transaction ${response.transaction.updateId}`);
  }
  return {
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    commandId,
    context,
    feeInputs: feeInputEvents.map(({ active, amount }) => ({
      contractId: active.createdEvent.contractId,
      amount,
      synchronizerId: active.synchronizerId,
    })),
    request: body,
    response,
    proposal: {
      templateId: proposalEvent.templateId,
      contractId: proposalEvent.contractId,
      createdEventBlob: proposalEvent.createdEventBlob,
      synchronizerId: response.transaction.synchronizerId,
      payload: createdPayload(proposalEvent),
    },
  };
}

async function tapValidator({ accessToken, amount }) {
  const context = await getNetworkContext(accessToken);
  const amuletRulesContractId = context.amuletRules.contract.contract_id;
  const openMiningRoundContractId = context.openMiningRound.contract.contract_id;
  const amuletRulesTemplateId = context.amuletRules.contract.template_id;
  const commandId = `codex-devnet-tap-validator-${crypto.randomUUID()}`;
  const body = {
    commands: {
      commandId,
      commands: [
        {
          ExerciseCommand: {
            templateId: amuletRulesTemplateId,
            contractId: amuletRulesContractId,
            choice: "AmuletRules_DevNet_Tap",
            choiceArgument: {
              receiver: context.validatorParty,
              amount: String(amount),
              openRound: openMiningRoundContractId,
            },
          },
        },
      ],
      actAs: [context.validatorParty],
      disclosedContracts: [
        toDisclosedContract(context.amuletRules),
        toDisclosedContract(context.openMiningRound),
      ],
      synchronizerId: toDisclosedContract(context.amuletRules).synchronizerId,
      packageIdSelectionPreference: [amuletRulesTemplateId.split(":")[0]],
    },
    transactionFormat: {
      eventFormat: makeWildcardEventFormat([context.validatorParty]),
      transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
    },
  };
  const response = await postJson(`${LEDGER_BASE}/v2/commands/submit-and-wait-for-transaction`, accessToken, body);
  const amuletEvent = findCreatedEventByTemplate(response.transaction, ":Splice.Amulet:Amulet");
  return {
    commandId,
    amount,
    context,
    response,
    amulet: amuletEvent ? {
      templateId: amuletEvent.templateId,
      contractId: amuletEvent.contractId,
      synchronizerId: response.transaction.synchronizerId,
      payload: createdPayload(amuletEvent),
    } : null,
  };
}

async function tapExternalParty({ accessToken, partyInfo, amount }) {
  const context = await getNetworkContext(accessToken);
  const privateKey = loadPrivateKey(partyInfo.private_key_pkcs8_pem);
  const amuletRulesContractId = context.amuletRules.contract.contract_id;
  const openMiningRoundContractId = context.openMiningRound.contract.contract_id;
  const amuletRulesTemplateId = context.amuletRules.contract.template_id;
  const commandId = `codex-devnet-tap-party-${crypto.randomUUID()}`;
  const prepareBody = {
    commandId,
    commands: [
      {
        ExerciseCommand: {
          templateId: amuletRulesTemplateId,
          contractId: amuletRulesContractId,
          choice: "AmuletRules_DevNet_Tap",
          choiceArgument: {
            receiver: partyInfo.party_id,
            amount: String(amount),
            openRound: openMiningRoundContractId,
          },
        },
      },
    ],
    actAs: [partyInfo.party_id],
    readAs: [partyInfo.party_id],
    disclosedContracts: [
      toDisclosedContract(context.amuletRules),
      toDisclosedContract(context.openMiningRound),
    ],
    synchronizerId: toDisclosedContract(context.amuletRules).synchronizerId,
    packageIdSelectionPreference: [amuletRulesTemplateId.split(":")[0]],
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  };
  const prepared = await postJson(`${LEDGER_BASE}/v2/interactive-submission/prepare`, accessToken, prepareBody);
  const signature = signPreparedHash(privateKey, prepared.preparedTransactionHash);
  const executeBody = {
    preparedTransaction: prepared.preparedTransaction,
    partySignatures: {
      signatures: [
        {
          party: partyInfo.party_id,
          signatures: [
            {
              format: "SIGNATURE_FORMAT_CONCAT",
              signature: signature.toString("base64"),
              signedBy: partyFingerprint(partyInfo.party_id),
              signingAlgorithmSpec: "SIGNING_ALGORITHM_SPEC_ED25519",
            },
          ],
        },
      ],
    },
    submissionId: `codex-devnet-tap-${crypto.randomUUID()}`,
    userId: "validator-backend@clients",
    hashingSchemeVersion: prepared.hashingSchemeVersion,
    deduplicationPeriod: deduplicationDuration(),
  };
  const executed = await postJson(
    `${LEDGER_BASE}/v2/interactive-submission/executeAndWaitForTransaction`,
    accessToken,
    executeBody,
  );
  const amuletEvent = findCreatedEventByTemplate(executed.transaction, ":Splice.Amulet:Amulet");
  return {
    commandId,
    amount,
    context,
    prepared: {
      preparedTransactionHash: prepared.preparedTransactionHash,
      hashingSchemeVersion: prepared.hashingSchemeVersion,
      costEstimation: prepared.costEstimation,
    },
    executed,
    amulet: amuletEvent ? {
      templateId: amuletEvent.templateId,
      contractId: amuletEvent.contractId,
      synchronizerId: executed.transaction.synchronizerId,
      payload: createdPayload(amuletEvent),
    } : null,
  };
}

async function acceptSetupProposal({ accessToken, partyInfo, proposal }) {
  const privateKey = loadPrivateKey(partyInfo.private_key_pkcs8_pem);
  const commandId = `codex-preapproval-accept-${crypto.randomUUID()}`;
  const prepareBody = {
    commandId,
    commands: [
      {
        ExerciseCommand: {
          templateId: proposal.templateId,
          contractId: proposal.contractId,
          choice: "ExternalPartySetupProposal_Accept",
          choiceArgument: {},
        },
      },
    ],
    actAs: [partyInfo.party_id],
    readAs: [partyInfo.party_id],
    disclosedContracts: [proposal],
    synchronizerId: proposal.synchronizerId,
    packageIdSelectionPreference: [proposal.templateId.split(":")[0]],
    verboseHashing: false,
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  };
  const prepared = await postJson(`${LEDGER_BASE}/v2/interactive-submission/prepare`, accessToken, prepareBody);
  const signature = signPreparedHash(privateKey, prepared.preparedTransactionHash);
  const executeBody = {
    preparedTransaction: prepared.preparedTransaction,
    partySignatures: {
      signatures: [
        {
          party: partyInfo.party_id,
          signatures: [
            {
              format: "SIGNATURE_FORMAT_CONCAT",
              signature: signature.toString("base64"),
              signedBy: partyFingerprint(partyInfo.party_id),
              signingAlgorithmSpec: "SIGNING_ALGORITHM_SPEC_ED25519",
            },
          ],
        },
      ],
    },
    submissionId: `codex-preapproval-${crypto.randomUUID()}`,
    userId: "validator-backend@clients",
    hashingSchemeVersion: prepared.hashingSchemeVersion,
    deduplicationPeriod: deduplicationDuration(),
  };
  const executed = await postJson(
    `${LEDGER_BASE}/v2/interactive-submission/executeAndWaitForTransaction`,
    accessToken,
    executeBody,
  );
  const preapprovalEvent = findCreatedEventByTemplate(
    executed.transaction,
    ":Splice.AmuletRules:TransferPreapproval",
  );
  return {
    commandId,
    prepared: {
      preparedTransactionHash: prepared.preparedTransactionHash,
      hashingSchemeVersion: prepared.hashingSchemeVersion,
      costEstimation: prepared.costEstimation,
    },
    executeBody: {
      ...executeBody,
      preparedTransaction: "<omitted>",
      partySignatures: {
        signatures: executeBody.partySignatures.signatures.map((partySignature) => ({
          party: partySignature.party,
          signatures: partySignature.signatures.map((sig) => ({
            ...sig,
            signature: `<base64:${signature.length} bytes>`,
          })),
        })),
      },
    },
    executed,
    transferPreapproval: preapprovalEvent ? {
      templateId: preapprovalEvent.templateId,
      contractId: preapprovalEvent.contractId,
      createdEventBlob: preapprovalEvent.createdEventBlob,
      synchronizerId: executed.transaction.synchronizerId,
      payload: createdPayload(preapprovalEvent),
    } : null,
  };
}

async function queryAcs({ accessToken, partyId, eventFormat }) {
  const ledgerEnd = await ledgerGet("/v2/state/ledger-end", accessToken);
  const activeAtOffset = ledgerEnd.offset;
  const responses = await postJson(
    `${LEDGER_BASE}/v2/state/active-contracts?limit=1000`,
    accessToken,
    { activeAtOffset, eventFormat },
  );
  return { activeAtOffset, activeContracts: unwrapActiveContracts(responses) };
}

function decimalValue(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object") {
    for (const key of ["amount", "value", "quantity"]) {
      if (key in value) return decimalValue(value[key]);
    }
  }
  return 0;
}

function holdingAmount(activeContract) {
  const event = activeContract.createdEvent;
  const view = event.interfaceViews?.[0]?.viewValue;
  const payload = view ?? createdPayload(event);
  return decimalValue(payload.amount ?? payload.quantity);
}

async function main() {
  const command = process.argv[2];
  const accessToken = await token();

  if (command === "version") {
    const [ledgerVersion, validatorUser] = await Promise.all([
      ledgerGet("/v2/version", accessToken),
      validatorGet("/v0/validator-user", accessToken),
    ]);
    console.log(JSON.stringify({ ledgerVersion, validatorUser }, null, 2));
    return;
  }

  if (command === "create-external-party") {
    const partyHint = process.argv[3] ?? `codex-lab-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    const keyInfo = generateEd25519();
    const result = await createExternalParty({ partyHint, accessToken, keyInfo });
    const output = {
      created_at: new Date().toISOString(),
      party_hint: partyHint,
      party_id: result.submitted.party_id,
      public_key_hex: keyInfo.publicKeyHex,
      public_key_spki_pem: keyInfo.publicKeySpkiPem,
      private_key_pkcs8_pem: keyInfo.privateKeyPkcs8Pem,
      topology_tx_count: result.generated.topology_txs.length,
      generated_party_id: result.generated.party_id,
      submitted: result.submitted,
    };
    const outPath = process.argv[4] ?? `canton-party-${Date.now()}.json`;
    await fs.writeFile(outPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify({
      party_id: output.party_id,
      generated_party_id: output.generated_party_id,
      public_key_hex: output.public_key_hex,
      topology_tx_count: output.topology_tx_count,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "create-setup-proposal") {
    const partyPath = process.argv[3] ?? ".\\codex-lab-party.json";
    const outPath = process.argv[4] ?? ".\\codex-lab-proposal.json";
    const partyInfo = JSON.parse(await fs.readFile(partyPath, "utf8"));
    const result = await createSetupProposal({ accessToken, partyId: partyInfo.party_id });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      party_id: partyInfo.party_id,
      validator_party: result.context.validatorParty,
      dso_party: result.context.dsoParty,
      proposal_contract_id: result.proposal.contractId,
      update_id: result.response.transaction.updateId,
      expires_at: result.expiresAt,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "tap-validator") {
    const amount = Number(process.argv[3] ?? "10");
    const outPath = process.argv[4] ?? ".\\codex-lab-validator-tap.json";
    const result = await tapValidator({ accessToken, amount });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      validator_party: result.context.validatorParty,
      amount,
      update_id: result.response.transaction.updateId,
      amulet_contract_id: result.amulet?.contractId,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "tap-party") {
    const partyPath = process.argv[3] ?? ".\\codex-lab-party.json";
    const amount = Number(process.argv[4] ?? "25");
    const outPath = process.argv[5] ?? ".\\codex-lab-party-tap.json";
    const partyInfo = JSON.parse(await fs.readFile(partyPath, "utf8"));
    const result = await tapExternalParty({ accessToken, partyInfo, amount });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      party_id: partyInfo.party_id,
      amount,
      prepared_hash: result.prepared.preparedTransactionHash,
      update_id: result.executed.transaction.updateId,
      amulet_contract_id: result.amulet?.contractId,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "accept-setup-proposal") {
    const partyPath = process.argv[3] ?? ".\\codex-lab-party.json";
    const proposalPath = process.argv[4] ?? ".\\codex-lab-proposal.json";
    const outPath = process.argv[5] ?? ".\\codex-lab-preapproval.json";
    const partyInfo = JSON.parse(await fs.readFile(partyPath, "utf8"));
    const proposalInfo = JSON.parse(await fs.readFile(proposalPath, "utf8"));
    const result = await acceptSetupProposal({
      accessToken,
      partyInfo,
      proposal: proposalInfo.proposal,
    });
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      party_id: partyInfo.party_id,
      prepared_hash: result.prepared.preparedTransactionHash,
      update_id: result.executed.transaction.updateId,
      transfer_preapproval_contract_id: result.transferPreapproval?.contractId,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "check-acs") {
    const partyPath = process.argv[3] ?? ".\\codex-lab-party.json";
    const outPath = process.argv[4] ?? ".\\codex-lab-acs.json";
    const partyInfo = JSON.parse(await fs.readFile(partyPath, "utf8"));
    const context = await getNetworkContext(accessToken);
    const amuletPackageId = context.amuletRules.contract.template_id.split(":")[0];
    const preapprovalTemplateId = "#splice-amulet:Splice.AmuletRules:TransferPreapproval";
    const holdingInterfaceId = "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";

    const [preapprovals, holdings] = await Promise.all([
      queryAcs({
        accessToken,
        partyId: partyInfo.party_id,
        eventFormat: makeTemplateEventFormat([partyInfo.party_id], preapprovalTemplateId),
      }),
      queryAcs({
        accessToken,
        partyId: partyInfo.party_id,
        eventFormat: makeInterfaceEventFormat([partyInfo.party_id], holdingInterfaceId),
      }),
    ]);

    const holdingSummaries = holdings.activeContracts.map((active) => ({
      contractId: active.createdEvent.contractId,
      templateId: active.createdEvent.templateId,
      amount: holdingAmount(active),
      payload: active.createdEvent.interfaceViews?.[0]?.viewValue ?? createdPayload(active.createdEvent),
    }));
    const result = {
      party_id: partyInfo.party_id,
      active_at_offsets: {
        preapprovals: preapprovals.activeAtOffset,
        holdings: holdings.activeAtOffset,
      },
      preapprovals: preapprovals.activeContracts.map((active) => ({
        contractId: active.createdEvent.contractId,
        templateId: active.createdEvent.templateId,
        payload: createdPayload(active.createdEvent),
      })),
      holdings: holdingSummaries,
      holding_total: holdingSummaries.reduce((sum, holding) => sum + holding.amount, 0),
    };
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      party_id: result.party_id,
      preapproval_count: result.preapprovals.length,
      holding_count: result.holdings.length,
      holding_total: result.holding_total,
      saved_to: outPath,
    }, null, 2));
    return;
  }

  if (command === "whoami") {
    const decoded = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    delete decoded.exp;
    delete decoded.iat;
    delete decoded.jti;
    console.log(JSON.stringify(decoded, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(none)"}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
