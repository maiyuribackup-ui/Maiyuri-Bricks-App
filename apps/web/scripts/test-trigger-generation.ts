/**
 * Test if generation can be triggered for the existing session
 */

const API_BASE = "http://localhost:3000";
const SESSION_ID = "313e06ff-6400-422c-8e3d-5e457bcd5f19";

async function testGenerationTrigger() {
  console.log("🔍 Testing Generation Trigger\n");

  try {
    // Try re-submitting the last answer to see what happens
    console.log("Submitting a dummy answer to trigger next question check...");
    const response = await fetch(`${API_BASE}/api/planning/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        questionId: "budgetRange",
        answer: "30-50l",
      }),
    });

    const data = await response.json();
    console.log("\n📊 Response:");
    console.log(JSON.stringify(data, null, 2));

    if (data.data) {
      console.log("\n✅ Status:", data.data.status);
      if (data.data.nextQuestion) {
        console.log("📝 Next Question:", data.data.nextQuestion.id);
        console.log("   Question:", data.data.nextQuestion.question);
      } else {
        console.log("✅ No more questions!");
      }

      if (data.data.status === "generating") {
        console.log("\n🎨 Generation has started!");
      } else if (data.data.status === "collecting") {
        console.log("\n⚠️  Still collecting answers");
        if (data.data.progress) {
          console.log(
            `   Progress: ${data.data.progress.current}/${data.data.progress.total} questions`,
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testGenerationTrigger();
