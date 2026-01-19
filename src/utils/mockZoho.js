// Simple mock to allow UI development on localhost
window.ZOHO = {
  embeddedApp: { init: () => Promise.resolve() },
  CRM: {
    API: {
      getRecords: () => Promise.resolve({ data: [/* 5 fake leads */] }),
      updateRecord: () => console.log("Mock Update"),
      createRecord: () => console.log("Mock Note Created")
    }
  }
};
