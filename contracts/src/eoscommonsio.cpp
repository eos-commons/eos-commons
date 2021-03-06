#include <eoscommonsio.hpp>



/*float eoscommonsio::stof(std::string s, float def)
    {   
        if (s == "") return def;
        std::size_t i = s.find(".");
        int digits = s.length() - i - 1;
        s.erase(i, 1); 
        return atoi(s.c_str()) / pow(10, digits);
    }*/

ACTION eoscommonsio::upsert(upsert_str payload) {
  name username = payload.username;
  // Will fail if the user does not sign the transaction 
  require_auth( username );
  // or require the contract athority. _self is the account that constructed the contract
  // require_auth( get_self() );

  // See https://nlohmann.github.io/json/
  // annoying problem https://www.bcskill.com/index.php/archives/714.html

  auto parsedJson = json::parse(payload.common, nullptr, false);
  check(!parsedJson.is_discarded(), "Invalid Json:\n" + payload.common);
  
  // print("UPSERT: ", parsedJson.dump(4), "\n");

  // Get the key from payload
  check(parsedJson.contains("key"), "Proposed upsert has no key:\n" + parsedJson.dump());
  auto key = name(parsedJson["key"].get<std::string>());

  auto classId = name("aaaaaaaaaaaa");
  auto parentId = name("aaaaaaaaaaaa");

  if(key != name("gzthjuyjca4s")){ // Exception for the root
    if(parsedJson.contains("classId")) {
      // Use the value from payload as foreign key
      classId = name(parsedJson["classId"].get<std::string>());
      // Make sure the foreigne key exsits
      auto common_iterator = commons_tbl.find( classId.value );
      check( common_iterator != commons_tbl.end(), "classId not found:\n" + parsedJson.dump());

      // Collect schema from classes
      // Validate common
    }
    else if(parsedJson.contains("parentId")) {
      // Use the value from payload as foreign key
      parentId = name(parsedJson["parentId"].get<std::string>());
      // Make sure the foreigne key exsits
      auto common_iterator = commons_tbl.find( parentId.value );
      check( common_iterator != commons_tbl.end(), "parentId not found: " + payload.common);
    }
    else check( false, "Must have either parentId or classId: " + payload.common);
  }

  auto common_iterator = commons_tbl.find( key.value );
  if( common_iterator == commons_tbl.end() )
  {
    // username - payer: usually the user
    // [&]: labda function, annomonus
    commons_tbl.emplace(username, [&]( auto& new_common ) {
      new_common.key = key;
      new_common.parentid = parentId;
      new_common.classid = classId;
      new_common.common = payload.common;
    });
  }
  else {
    commons_tbl.modify( common_iterator, _self, [&]( auto& existing_common ) {
      existing_common.parentid = parentId;
      existing_common.classid = classId;
      existing_common.common = payload.common;
    });
  }
}

ACTION eoscommonsio::erase(erase_str payload) {
  name username = payload.username;
  name key = payload.key;
  require_auth(username);

  auto common_iterator = commons_tbl.find(key.value);
  if(common_iterator != commons_tbl.end()) commons_tbl.erase(common_iterator);

  auto agreementstack_iterator = agreementstack_tbl.find(key.value);
  if(agreementstack_iterator != agreementstack_tbl.end()) agreementstack_tbl.erase(agreementstack_iterator);
}

ACTION eoscommonsio::eraseall(eraseall_str payload) {
  // Example send transactions https://eosio.stackexchange.com/questions/1214/delete-all-multi-index-records-without-iterator
  name username = payload.username;
  require_auth(username);

  for(auto common_iterator = commons_tbl.begin(); common_iterator != commons_tbl.end();) {
      // delete element and update iterator reference
      common_iterator = commons_tbl.erase(common_iterator);
  }

  for(auto agreementstack_iterator = agreementstack_tbl.begin(); agreementstack_iterator != agreementstack_tbl.end();) {
      // delete element and update iterator reference
      agreementstack_iterator = agreementstack_tbl.erase(agreementstack_iterator);
  }
}

/* addagreement(upsert_str payload)
    key
    agreementProcessId
    sellerProcessId
*/
ACTION eoscommonsio::addagreement(upsert_str payload) {
  name username = payload.username;
  require_auth(username);

  // Parse the payload
  auto parsedJson = json::parse(payload.common, nullptr, false);
  check(!parsedJson.is_discarded(), "Invalid Json: " + payload.common);
  

  // Get the key from agreement
  check(parsedJson.contains("key"), "Proposed agrrement has no key:\n" + parsedJson.dump());
  auto agreementId = name(parsedJson["key"].get<std::string>());

  // Make sure the agreement doesn't already exist
  auto common_iterator = commons_tbl.find( agreementId.value );
  check(common_iterator == commons_tbl.end(), "This agreement already exists:\n" + parsedJson.dump());

  // Get the Process obj for this agreement. 
  // Use it to determin the the type (classId) of the agreement 

  // Get the agreementProcessId from agreement 
  check(parsedJson.contains("agreementProcessId"), "Proposed agrrement has no agreementProcessId:\n" + parsedJson.dump());
  auto pocsessId = name(parsedJson["agreementProcessId"].get<std::string>());

  // Get the processObj
  auto process_iterator = commons_tbl.find( pocsessId.value );
  check(process_iterator != commons_tbl.end(), "This agreement processId could not be found: " + pocsessId.to_string());

  // Parse the processObj
  auto parsedProcessJson = json::parse(process_iterator->common, nullptr, false);
  check(!parsedProcessJson.is_discarded(), "Invalid Json: " + process_iterator->common);

  // Get the agreementClassId from processObj
  check(parsedProcessJson.contains("agreementClassId"), "Proposed agrrement process has no agreementClassId:\n" + parsedProcessJson.dump());
  auto agreementClassId = name(parsedProcessJson["agreementClassId"].get<std::string>());
  // Use agreementClassId as classId for the new agreement
  parsedJson["classId"] = agreementClassId.to_string();

  // Add start date to agreement
  parsedJson["startDate"] = "2020-01-10";

  // update payload for when we do the upsert
  payload.common = parsedJson.dump();

  // Create the Process stack
  // Initialize it with Initialize state and agreement processId

  // Make sure there isn't an agreementstack already
  auto agreementstack_iterator = agreementstack_tbl.find( agreementId.value );
  check(agreementstack_iterator == agreementstack_tbl.end(), "This agreement already has a agreement stack:\n" + parsedJson.dump());

  // Create a processstate with Initialize state and current process. Add it to the stack.
  processstate_str processState = { name(pocsessId), name("gczvalloctae"), false, current_time_point() }; 
  std::vector<processstate_str> stack;
  stack.push_back( processState );

  // Update the agreement stack table
  agreementstack_tbl.emplace(username, [&]( auto& new_stack ) {
    new_stack.agreementid = agreementId;
    new_stack.stack = stack;
  });


  // Now add the agreement
  upsert( payload );

  // Finally, Start the process
  bumpState_str bumpsatePayload = { username, agreementId, "" };
  // SEND_INLINE_ACTION( *this, bumpstate, {username, name("active")}, bumpsatePayload );
  bumpstate( bumpsatePayload );
}

ACTION eoscommonsio::bumpstate(bumpState_str payload) {
  name username = payload.username;
  name agreementid = payload.agreementid;
  std::string action = payload.action;
  require_auth(username);

  print("{ \"bumpstate\": ", payload.toJson(), ",\n");


  // Get the agreement
  auto commons_iterator = commons_tbl.find( agreementid.value );
  check(commons_iterator != commons_tbl.end(), "Couldn't find the agreement: " + agreementid.to_string());
  auto parsedAgreement = json::parse(commons_iterator->common, nullptr, false);
  check(!parsedAgreement.is_discarded(), "Invalid Json: " + commons_iterator->common);

  // Get the agreement process stack
  auto agreementstack_iterator = agreementstack_tbl.find( agreementid.value );
  check(agreementstack_iterator != agreementstack_tbl.end(), "Couldn't find the process stack for this agreement: " + agreementid.to_string());
  auto stack = agreementstack_iterator->stack;
  

    name stateId = name("aaaaaaaaaaaaa");
    bool executeType = false;
    bool delegateType = false;

  // do {

    // get the current processstate
    processstate_str currentProcessState = stack.back();



    // If current state is initializing, set the current stateId to the process substateId
    if ( currentProcessState.stateid == name("gczvalloctae") ) { // Initialize state
        
      // Get the process obj
      auto commons_iterator = commons_tbl.find( currentProcessState.processid.value );
      check(commons_iterator != commons_tbl.end(), "Couldn't find the process obj: " + currentProcessState.processid.to_string());
      auto parsedProcessJson = json::parse(commons_iterator->common, nullptr, false);
      check(!parsedProcessJson.is_discarded(), "Invalid Json: " + commons_iterator->common);

      // Get the substateId from processObj
      check(parsedProcessJson.contains("substateId"), "Stack process has no substateId:\n" + parsedProcessJson.dump(4));
      auto substateid = name(parsedProcessJson["substateId"].get<std::string>());

      // Use substateid as current stateId
      currentProcessState.stateid = substateid;
      currentProcessState.updated_at = current_time_point();
      stack.back() = currentProcessState;

    }


    // If current state isA Delegate and not done, find the sellerProcessId, add it the the stack
    else if ( isA(currentProcessState.stateid, name("jotxozcetpx2") ) && currentProcessState.done == false) { // Delegate state

      // Set current ProcessState to done, so that on the way back we continu
      currentProcessState.done = true;
      currentProcessState.updated_at = current_time_point();
      stack.back() = currentProcessState;

      // Get the sellerProcessId from agreementObj
      check(parsedAgreement.contains("sellerProcessId"), "agreementObj has no sellerProcessId: " + agreementid.to_string());
      auto sellerProcessId = name(parsedAgreement["sellerProcessId"].get<std::string>());

      // Create a processstate with Initialize state and current process. Push it to the stack.
      processstate_str processState = { name(sellerProcessId), name("gczvalloctae"), false, current_time_point() }; 
      stack.push_back( processState );

    }


    else { 

      // If current state isA Execute, do stuf and set the next action
      if ( isA(currentProcessState.stateid, name("dqja423wlzrb") ) ) { // Execute state
        // Skip for now
        action = "happy";
      }
      
      print("ACTION:", action, "\n");


      // Process the action
      check( !action.empty(), "No action provided: " + agreementid.to_string());

      // Get stateObj from processStackObj.stateId
      auto commons_iterator = commons_tbl.find( currentProcessState.stateid.value );
      check(commons_iterator != commons_tbl.end(), "Couldn't find the state obj: " + currentProcessState.stateid.to_string());
      auto parsedStateJson = json::parse(commons_iterator->common, nullptr, false);
      check(!parsedStateJson.is_discarded(), "Invalid Json: " + commons_iterator->common);


      // Get the nextStateIds from state obj
      check(parsedStateJson.contains("nextStateIds"), "State process has no nextStateIds:\n" + parsedStateJson.dump());
      auto nextStateIds = parsedStateJson["nextStateIds"];

      // Find the nextStateIds obj that corresponds with our action
      auto actionStateIter = std::find_if(nextStateIds.begin(), nextStateIds.end(), [=](const json& actionStateObj) {
          auto it = actionStateObj.find("action");
          return it != actionStateObj.end() and (*it) == action;
      });

      // If found, use the nextStateId
      if(actionStateIter != nextStateIds.end()) {
        auto nextStateIdIter = actionStateIter->find("stateId");
        check(nextStateIdIter != actionStateIter->end(), "nextStateIds has no stateId for action: " + action + "\n" + parsedStateJson.dump());

        std::string next = nextStateIdIter.value();
        currentProcessState.stateid = name(next);
        currentProcessState.updated_at = current_time_point();
        stack.back() = currentProcessState;

      }

      // We couldn't find a nextStateId, so we return
      else {

        // Are we in a sub process? If so, send action to super process
        if( stack.size() > 1) {
          // Remove the end processStack
          stack.pop_back();
        }
        else {
          // Otherwize we are at the end
          if (action == "happy") currentProcessState.stateid = name("3hxkire2nn4v"); // Sucess
          else currentProcessState.stateid = name("zdwdoqpxks2s"); // Failed
          currentProcessState.updated_at = current_time_point();
          stack.back() = currentProcessState;

          // TODO cleanup agreementstack, Update agreement 
        }
      
      }

    }


    // Update the agreement stack table
    agreementstack_tbl.modify( agreementstack_iterator, _self, [&]( auto& existing_stack ) {
      existing_stack.stack = stack;
    });

    // get the current processstate
    currentProcessState = stack.back();

    print("\"result\": ", currentProcessState.toJson(), " }\n");

      /*char buffer[32];
      time_t current_time = current_time_point().sec_since_epoch();
      std::strftime(buffer, sizeof(buffer), "%FT%TZ", std::gmtime(&current_time));
      print( buffer, "\n" );*/

    stateId = currentProcessState.stateid;
    executeType = isA(stateId, name("dqja423wlzrb")); // Execute Type
    delegateType = isA(stateId, name("jotxozcetpx2")); // Delegate Type
    

    //TODO We may have to relace SEND_INLINE_ACTION with do while
    if( executeType || delegateType || stateId == name("gczvalloctae" )) {
      bumpState_str bumpsatePayload = { username, agreementid, action };

      // SEND_INLINE_ACTION( *this, bumpstate, { username, name("active") }, bumpsatePayload );
      bumpstate( bumpsatePayload );
    }

  // } while (executeType || delegateType || stateId == name("gczvalloctae")); // Initialize
    
}

// Recusivly get the common. Check to see if the parentId equals saughtId.
bool eoscommonsio::isA ( name key, name saughtId ) {
  auto iterator = commons_tbl.find( key.value );
  check(iterator != commons_tbl.end(), "key could not be found: " + key.to_string());
  if(iterator->classid == saughtId || iterator->parentid == saughtId) return true;
  else if (iterator->parentid != name("aaaaaaaaaaaa")) return isA (iterator->parentid, saughtId);
  return false; // no parent class, we are at the root
}


